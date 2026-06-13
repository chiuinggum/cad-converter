"""
Pro-CAD interactive pipeline for WonderCAD frontend.
Invoked by server.ts: python procad_service.py <action>  (stdin: JSON, stdout: JSON)
"""

import json
import os
import re
import sys
import uuid
import base64
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

FRONTEND_ROOT = Path(__file__).resolve().parent


def resolve_wondercad_root() -> Path:
    env = os.environ.get("WONDERCAD_ROOT")
    if env:
        return Path(env).resolve()
    return FRONTEND_ROOT.parent.resolve()


def resolve_procad_root() -> Path:
    candidates = [
        os.environ.get("PROCAD_ROOT"),
        str(FRONTEND_ROOT.parent / "src" / "Pro-CAD"),
        "/dss/dssmcmlfs01/pn46ju/pn46ju-dss-0000/caizhuojiang/wondercad/src/Pro-CAD",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).resolve()
        if path.is_dir():
            return path
    raise FileNotFoundError(
        "Pro-CAD directory not found. Set PROCAD_ROOT to your Pro-CAD clone."
    )


PROCAD_ROOT = resolve_procad_root()
WONDERCAD_ROOT = resolve_wondercad_root()
DRAWING_AGENT_SRC = WONDERCAD_ROOT / "src"
SESSIONS_ROOT = FRONTEND_ROOT / ".sessions"
CODER_LOCAL = PROCAD_ROOT / "models" / "ProCAD-coder"

os.chdir(str(PROCAD_ROOT))
sys.path.insert(0, str(PROCAD_ROOT))
if DRAWING_AGENT_SRC.is_dir():
    sys.path.insert(0, str(DRAWING_AGENT_SRC))

from dotenv import load_dotenv

load_dotenv(WONDERCAD_ROOT / ".env")
load_dotenv(PROCAD_ROOT / ".env")
load_dotenv(FRONTEND_ROOT / ".env")

from config.code_generation import (
    CODE_GENERATION_SYSTEM_PROMPT,
    CODE_GENERATION_USER_PROMPT_TEMPLATE,
)
from config.clarification import CLARIFY_WITH_ANSWERS_PROMPT_TEMPLATE
from src.ask_agent import AskAgent
from src.inference import LLM
from src.mesh_utils import cadquery_to_mesh

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
CLARIFY_MODEL = os.environ.get("CLARIFY_AGENT_MODEL", GEMINI_MODEL)
ANSWER_MODEL = os.environ.get("ANSWER_MODEL", GEMINI_MODEL)
CODE_MODEL = os.environ.get("CODE_GEN_MODEL", GEMINI_MODEL)

USER_ANSWER_TEMPLATE = """You are the user who submitted this CAD design request.

ORIGINAL REQUEST:
{prompt}

{extra_context}

The design assistant asked these clarifying questions:
{questions}

Answer each question clearly with specific dimensions and choices. Use numbered answers."""

CODE_EDIT_SYSTEM = """You are a CadQuery expert. Edit the existing CadQuery script according to the user's instruction.
Rules:
- Keep import cadquery as cq
- Final geometry must be stored in variable r
- Output only Python code, no markdown or explanations"""

CODE_EDIT_USER = """Current CAD description:
{description}

Current CadQuery code:
{code}

User instruction:
{instruction}

Return the full updated CadQuery Python code."""


def extract_code(response: str) -> str:
    code = (response or "").strip()
    if code.startswith("```python"):
        code = code[9:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
    return code.strip()


def prepare_cadquery_code(code: str) -> str:
    code = extract_code(code)
    if "import cadquery" not in code:
        code = "import cadquery as cq\n" + code
    if "r =" not in code and "result" in code:
        code = code.rstrip() + "\nr = result\n"
    return code


def session_dir(session_id: str) -> Path:
    path = SESSIONS_ROOT / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_session(session_id: str) -> Dict[str, Any]:
    meta_path = session_dir(session_id) / "session.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Session not found: {session_id}")
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_session(session_id: str, data: Dict[str, Any]) -> None:
    data["updated_at"] = datetime.utcnow().isoformat()
    with open(session_dir(session_id) / "session.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def enrich_prompt_with_image(
    prompt: str,
    image_b64: Optional[str],
    mime_type: Optional[str],
    llm: LLM,
    drawing_spec: Optional[Dict[str, Any]] = None,
) -> str:
    if not image_b64:
        return prompt

    raw = image_b64.split("base64,")[-1] if "base64," in image_b64 else image_b64
    mime = mime_type or "image/png"

    spec_block = ""
    if drawing_spec:
        spec_block = (
            "\n\nStructured drawing spec (pre-extracted from the image):\n"
            + json.dumps(drawing_spec, indent=2, ensure_ascii=False)
        )

    vision_prompt = (
        "Analyze this mechanical engineering drawing or reference image. "
        "Extract dimensions, features, and geometry needed for CAD modeling. "
        "Combine with the user's text prompt into one precise CAD build description. "
        "Use the structured drawing spec when provided. "
        "Output plain text only, no markdown.\n\nUser text:\n"
        + prompt
        + spec_block
    )

    try:
        from google import genai
        from google.genai import types

        api_key = os.environ.get("GEMINI_API_KEY", "")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(data=base64.b64decode(raw), mime_type=mime),
                        types.Part.from_text(text=vision_prompt),
                    ],
                )
            ],
        )
        text = (response.text or "").strip()
        if text:
            return text
    except Exception:
        pass

    # Fallback: text-only merge hint
    messages = [
        {
            "role": "user",
            "content": f"The user uploaded a technical drawing with this text prompt:\n{prompt}\n"
            + (spec_block or "")
            + "\nExpand into a detailed CAD description assuming standard mechanical drawing conventions.",
        }
    ]
    return llm.inference(messages=messages)


def extract_drawing_spec_from_image(
    image_b64: Optional[str],
    mime_type: Optional[str],
    out_dir: Path,
) -> Optional[Dict[str, Any]]:
    if not image_b64:
        return None

    from drawing_agent.extractor import extract_drawing

    raw = image_b64.split("base64,")[-1] if "base64," in image_b64 else image_b64
    mime = mime_type or "image/png"
    ext = ".jpg" if "jpeg" in mime or "jpg" in mime else ".png"
    img_path = out_dir / f"reference_drawing{ext}"
    img_path.write_bytes(base64.b64decode(raw))

    spec = extract_drawing(img_path, model=GEMINI_MODEL)
    return json.loads(spec.model_dump_json())


def append_drawing_spec_context(text: str, drawing_spec: Optional[Dict[str, Any]]) -> str:
    if not drawing_spec:
        return text
    return (
        text
        + "\n\nSTRUCTURED DRAWING SPEC JSON:\n"
        + json.dumps(drawing_spec, indent=2, ensure_ascii=False)
    )


def format_drawing_spec_log(spec: Dict[str, Any]) -> str:
    lines = ["[Drawing Agent] Structured DrawingSpec extraction complete."]
    if spec.get("part_name"):
        lines.append(f"[Drawing Agent] Part name: {spec['part_name']}")
    if spec.get("drawing_number"):
        lines.append(f"[Drawing Agent] Drawing number: {spec['drawing_number']}")
    unit = spec.get("default_unit")
    if unit:
        lines.append(f"[Drawing Agent] Default unit: {unit}")

    views = spec.get("views") or []
    if views:
        lines.append(f"[Drawing Agent] Views ({len(views)}):")
        for view in views[:6]:
            label = view.get("label") or view.get("view_type") or view.get("id")
            lines.append(f"  · {label}: {view.get('description', '')[:120]}")
        if len(views) > 6:
            lines.append(f"  … +{len(views) - 6} more views")

    dimensions = spec.get("dimensions") or []
    if dimensions:
        lines.append(f"[Drawing Agent] Dimensions ({len(dimensions)}):")
        for dim in dimensions[:15]:
            val = dim.get("value")
            val_str = str(val) if val is not None else "limit/unknown"
            lines.append(
                f"  · {dim.get('id')}: {val_str} {dim.get('unit', '')} "
                f"→ {dim.get('applies_to', '')[:80]}"
            )
        if len(dimensions) > 15:
            lines.append(f"  … +{len(dimensions) - 15} more dimensions")

    features = spec.get("features") or []
    if features:
        lines.append(f"[Drawing Agent] Features ({len(features)}):")
        for feat in features[:8]:
            lines.append(
                f"  · {feat.get('feature_type')}: {feat.get('description', '')[:100]}"
            )
        if len(features) > 8:
            lines.append(f"  … +{len(features) - 8} more features")

    ambiguities = spec.get("ambiguities") or []
    if ambiguities:
        lines.append(f"[Drawing Agent] Ambiguities flagged ({len(ambiguities)}):")
        for amb in ambiguities[:5]:
            lines.append(f"  ? {amb.get('question') or amb.get('description', '')[:100]}")

    notes = spec.get("general_notes") or []
    if notes:
        lines.append(f"[Drawing Agent] Notes ({len(notes)}):")
        for note in notes[:4]:
            lines.append(f"  · {note[:120]}")

    return "\n".join(lines)
def format_drawing_spec_extra(drawing_spec: Optional[Dict[str, Any]]) -> str:
    if not drawing_spec:
        return ""
    dim_n = len(drawing_spec.get("dimensions") or [])
    feat_n = len(drawing_spec.get("features") or [])
    amb_n = len(drawing_spec.get("ambiguities") or [])
    return (
        f"Structured drawing spec available ({dim_n} dimensions, "
        f"{feat_n} features, {amb_n} ambiguities)."
    )


def answer_questions(
    prompt: str,
    questions: List[str],
    extra_context: str,
    llm: LLM,
) -> List[str]:
    q_text = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
    messages = [
        {
            "role": "user",
            "content": USER_ANSWER_TEMPLATE.format(
                prompt=prompt,
                extra_context=extra_context or "No additional context.",
                questions=q_text,
            ),
        }
    ]
    response = llm.inference(messages=messages)
    lines = [ln.strip() for ln in response.splitlines() if ln.strip()]
    answers: List[str] = []
    for ln in lines:
        cleaned = re.sub(r"^\d+[\).\s]+", "", ln).strip()
        if cleaned:
            answers.append(cleaned)
    if len(answers) < len(questions):
        answers.extend(["See original request context."] * (len(questions) - len(answers)))
    return answers[: len(questions)]


def clarify_with_answers(
    misleading_prompt: str,
    questions: List[str],
    answers: List[str],
    llm: LLM,
) -> str:
    qa_pairs = "\n".join(
        f"Q: {q}\nA: {a}" for q, a in zip(questions, answers)
    )
    messages = [
        {
            "role": "user",
            "content": CLARIFY_WITH_ANSWERS_PROMPT_TEMPLATE.format(
                misleading_prompt=misleading_prompt,
                qa_pairs=qa_pairs,
            ),
        }
    ]
    return llm.inference(messages=messages).strip()


def generate_code(description: str, llm: LLM) -> str:
    messages = [
        {"role": "system", "content": CODE_GENERATION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": CODE_GENERATION_USER_PROMPT_TEMPLATE.format(description=description),
        },
    ]
    response = llm.inference(messages=messages)
    return prepare_cadquery_code(response)


def repair_code(code: str, error: str, llm: LLM) -> str:
    messages = [
        {"role": "system", "content": CODE_EDIT_SYSTEM},
        {
            "role": "user",
            "content": f"The following CadQuery code failed:\n{error}\n\nCode:\n{code}\n\nFix and return working code with variable r.",
        },
    ]
    return prepare_cadquery_code(llm.inference(messages=messages))


def export_assets(code: str, out_dir: Path) -> Dict[str, str]:
    import cadquery as cq

    prepared = prepare_cadquery_code(code)
    namespace: Dict[str, Any] = {"cq": cq}
    exec(prepared, namespace)
    r = namespace.get("r") or namespace.get("result")
    if r is None:
        raise ValueError("Code must define variable r (or result) with CadQuery geometry")

    mesh = cadquery_to_mesh(prepared)

    stl_path = out_dir / "model.stl"
    glb_path = out_dir / "model.glb"
    step_path = out_dir / "model.step"
    py_path = out_dir / "generated.py"

    mesh.export(str(stl_path))
    mesh.export(str(glb_path))
    cq.exporters.export(r, str(step_path))
    with open(py_path, "w", encoding="utf-8") as f:
        f.write(prepared)

    return {
        "stl": str(stl_path),
        "glb": str(glb_path),
        "step": str(step_path),
        "py": str(py_path),
        "prepared_code": prepared,
    }


def make_iteration(
    attempt: int,
    step_name: str,
    status: str,
    logs: str,
    code: str = "",
) -> Dict[str, Any]:
    return {
        "attempt": attempt,
        "stepName": step_name,
        "status": status,
        "logs": logs,
        "code": code,
        "comparison": None,
        "failing": [] if status == "success" else ["execution"],
    }


def file_urls(session_id: str) -> Dict[str, str]:
    base = f"/api/procad/files/{session_id}"
    return {
        "glbUrl": f"{base}/model.glb",
        "stlUrl": f"{base}/model.stl",
        "stepUrl": f"{base}/model.step",
        "pyUrl": f"{base}/generated.py",
    }


EmitFn = Optional[Callable[[Dict[str, Any]], None]]


def _pipeline_emit(emit: EmitFn, event: Dict[str, Any]) -> None:
    if emit:
        emit(event)


def run_generate(data: Dict[str, Any], emit: EmitFn = None) -> Dict[str, Any]:
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return {"success": False, "error": "prompt is required"}

    session_id = data.get("sessionId") or str(uuid.uuid4())
    out_dir = session_dir(session_id)
    iterations: List[Dict[str, Any]] = []
    has_image = bool(data.get("image"))
    drawing_spec: Optional[Dict[str, Any]] = None

    pipeline_steps: List[str] = []
    if has_image:
        pipeline_steps.append("Drawing Spec Extract")
    pipeline_steps.extend(
        [
            "Vision & Prompt Merge",
            "Clarifier",
            "Coder",
            "Sandbox Export",
        ]
    )

    step_vision = 2 if has_image else 1
    step_clarify = step_vision + 1
    step_coder = step_clarify + 1
    step_sandbox = step_coder + 1

    _pipeline_emit(
        emit,
        {
            "type": "pipeline_start",
            "message": "Starting agent pipeline: drawing analysis → clarify → CadQuery → 3D export",
            "steps": pipeline_steps,
        },
    )

    clarify_llm = LLM(model_name=CLARIFY_MODEL)
    answer_llm = LLM(model_name=ANSWER_MODEL)
    code_llm = LLM(model_name=CODE_MODEL)

    if has_image:
        _pipeline_emit(
            emit,
            {
                "type": "step_start",
                "step": 1,
                "stepName": "Drawing Spec Extract",
                "message": "Initializing drawing agent — loading reference image and Gemini structured schema…",
            },
        )
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": 1,
                "stepName": "Drawing Spec Extract",
                "message": f"Calling {GEMINI_MODEL} with high-resolution vision to extract DrawingSpec JSON…",
            },
        )
        try:
            drawing_spec = extract_drawing_spec_from_image(
                data.get("image"),
                data.get("imageType"),
                out_dir,
            )
            spec_logs = format_drawing_spec_log(drawing_spec or {})
            iter_spec = make_iteration(
                1,
                "Drawing Spec Extract",
                "success",
                spec_logs,
                "",
            )
            iterations.append(iter_spec)
            dim_n = len((drawing_spec or {}).get("dimensions") or [])
            feat_n = len((drawing_spec or {}).get("features") or [])
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": 1,
                    "iteration": iter_spec,
                    "message": f"Drawing spec ready — {dim_n} dimensions, {feat_n} features captured.",
                    "drawingSpec": drawing_spec,
                },
            )
        except Exception as exc:
            err = str(exc)
            iter_spec_fail = make_iteration(
                1,
                "Drawing Spec Extract",
                "exec_error",
                f"[Drawing Agent] Extraction failed: {err}\n[Drawing Agent] Pipeline will continue with vision-only analysis.",
                "",
            )
            iterations.append(iter_spec_fail)
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": 1,
                    "iteration": iter_spec_fail,
                    "message": f"Drawing spec extraction failed — continuing with vision merge. ({err})",
                },
            )

    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": step_vision,
            "stepName": "Vision & Prompt Merge",
            "message": "Merging user prompt with drawing context and vision analysis…",
        },
    )
    _pipeline_emit(
        emit,
        {
            "type": "step_progress",
            "step": step_vision,
            "stepName": "Vision & Prompt Merge",
            "message": "Running multimodal merge — combining text prompt, image, and structured spec…",
        },
    )
    merged_prompt = enrich_prompt_with_image(
        prompt,
        data.get("image"),
        data.get("imageType"),
        clarify_llm,
        drawing_spec,
    )

    iter1 = make_iteration(
        step_vision,
        "Vision & Prompt Merge",
        "success",
        f"[Input] User prompt: {len(prompt)} chars.\n[Vision] Merged CAD description: {len(merged_prompt)} chars."
        + (f"\n{format_drawing_spec_extra(drawing_spec)}" if drawing_spec else "")
        + "\n[Vision] Preview:\n"
        + merged_prompt[:600]
        + ("…" if len(merged_prompt) > 600 else ""),
        "",
    )
    iterations.append(iter1)
    _pipeline_emit(
        emit,
        {
            "type": "step_done",
            "step": step_vision,
            "iteration": iter1,
            "message": f"Prompt merge complete ({len(merged_prompt)} characters).",
        },
    )

    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": step_clarify,
            "stepName": "Clarifier",
            "message": "Clarifier is checking for ambiguity, conflicts, and missing dimensions…",
        },
    )
    agent = AskAgent(model_name=CLARIFY_MODEL)
    analysis = agent.analyze(merged_prompt)
    is_misleading = bool(analysis.get("is_misleading"))
    questions = analysis.get("questions") or []
    answers: List[str] = []
    clarified = merged_prompt

    if is_misleading and questions:
        q_preview = "\n".join(f"• {q}" for q in questions)
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": step_clarify,
                "message": f"Ambiguity detected — {len(questions)} clarification question(s):\n{q_preview}",
            },
        )
        iterations.append(
            make_iteration(
                step_clarify,
                "Clarifier — Ambiguity Detected",
                "running",
                "[Clarifier] Prompt is misleading/ambiguous.\n"
                + "\n".join(f"  Q: {q}" for q in questions),
                "",
            )
        )
        extra = format_drawing_spec_extra(drawing_spec)
        if data.get("image") and not extra:
            extra = "User also provided a reference drawing image."
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": step_clarify,
                "message": "Gemini is simulating user answers to clarification questions…",
            },
        )
        answers = answer_questions(merged_prompt, questions, extra, answer_llm)
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": step_clarify,
                "message": "Generating corrected CAD description from Q&A…",
            },
        )
        clarified = clarify_with_answers(merged_prompt, questions, answers, clarify_llm)
        iterations[-1]["status"] = "success"
        iterations[-1]["logs"] += "\n[Answer Agent] Simulated user answers received.\n[Clarifier] Corrected description generated."
        iter2 = iterations[-1]
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_clarify,
                "iteration": iter2,
                "message": f"Clarification complete — answered {len(answers)} question(s) and produced a standardized description.",
                "questions": questions,
                "answers": answers,
            },
        )
    elif analysis.get("standardized_prompt"):
        clarified = analysis.get("standardized_prompt")
        iter2 = make_iteration(
            step_clarify,
            "Clarifier — Prompt Accepted",
            "success",
            "[Clarifier] Prompt is clear. Proceeding to code generation.",
            "",
        )
        iterations.append(iter2)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_clarify,
                "iteration": iter2,
                "message": "Description is clear — proceeding directly to code generation.",
            },
        )
    else:
        iter2 = make_iteration(
            step_clarify,
            "Clarifier — Prompt Accepted",
            "success",
            "[Clarifier] No clarification needed.",
            "",
        )
        iterations.append(iter2)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_clarify,
                "iteration": iter2,
                "message": "Description accepted — skipping clarification.",
            },
        )

    code = ""
    exec_error = None
    codegen_input = append_drawing_spec_context(clarified, drawing_spec)
    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": step_coder,
            "stepName": "Coder — CadQuery Generation",
            "message": f"Coder ({CODE_MODEL}) is generating CadQuery code from the description…",
        },
    )
    _pipeline_emit(
        emit,
        {
            "type": "step_progress",
            "step": step_coder,
            "stepName": "Coder — CadQuery Generation",
            "message": f"Invoking {CODE_MODEL} with clarified description and drawing spec context…",
        },
    )
    try:
        code = generate_code(codegen_input, code_llm)
        iter3 = make_iteration(
            step_coder,
            "Coder — CadQuery Generation",
            "success",
            f"[Coder] Model: {CODE_MODEL}\n[Coder] Input description: {len(codegen_input)} chars.\n[Coder] Generated {len(code)} chars of CadQuery.\n[Coder] Preview:\n{code[:500]}{'…' if len(code) > 500 else ''}",
            code,
        )
        iterations.append(iter3)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_coder,
                "iteration": iter3,
                "message": f"CadQuery code generated ({len(code)} characters).",
            },
        )
        _pipeline_emit(
            emit,
            {
                "type": "step_start",
                "step": step_sandbox,
                "stepName": "Sandbox — Execute & Export",
                "message": "Executing CadQuery and exporting STL / GLB / STEP…",
            },
        )
        assets = export_assets(code, out_dir)
        code = assets["prepared_code"]
        iter4 = make_iteration(
            step_sandbox,
            "Sandbox — Execute & Export",
            "success",
            "[Sandbox] CadQuery executed successfully.\n[Exporter] STL, GLB, STEP exported.",
            code,
        )
        iterations.append(iter4)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_sandbox,
                "iteration": iter4,
                "message": "3D model executed successfully — downloadable files exported.",
            },
        )
    except Exception as e:
        exec_error = str(e)
        iter_fail = make_iteration(
            step_coder,
            "Coder — CadQuery Generation",
            "exec_error",
            f"[Coder] Initial codegen or execution failed: {exec_error}",
            code,
        )
        iterations.append(iter_fail)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_coder,
                "iteration": iter_fail,
                "message": f"Code generation or execution failed: {exec_error}",
            },
        )
        if code:
            _pipeline_emit(
                emit,
                {
                    "type": "step_start",
                    "step": step_sandbox,
                    "stepName": "Repair — Code Fix",
                    "message": "Repair Agent is attempting to fix the CadQuery code…",
                },
            )
            try:
                code = repair_code(code, exec_error, code_llm)
                assets = export_assets(code, out_dir)
                code = assets["prepared_code"]
                iter4 = make_iteration(
                    step_sandbox,
                    "Repair — Code Fix & Export",
                    "success",
                    f"[Repair] Fixed execution error.\n[Exporter] STL, GLB, STEP exported.",
                    code,
                )
                iterations.append(iter4)
                exec_error = None
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step_sandbox,
                        "iteration": iter4,
                        "message": "Auto-repair succeeded — model re-exported.",
                    },
                )
            except Exception as e2:
                exec_error = str(e2)
                iter4_fail = make_iteration(
                    step_sandbox,
                    "Repair — Failed",
                    "exec_error",
                    f"[Repair] Could not fix model: {exec_error}\n{traceback.format_exc()}",
                    code,
                )
                iterations.append(iter4_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step_sandbox,
                        "iteration": iter4_fail,
                        "message": f"Auto-repair failed: {exec_error}",
                    },
                )

    session = {
        "sessionId": session_id,
        "prompt": prompt,
        "mergedPrompt": merged_prompt,
        "clarifiedPrompt": clarified,
        "drawingSpec": drawing_spec,
        "questions": questions,
        "answers": answers,
        "isMisleading": is_misleading,
        "code": code,
        "history": [{"role": "user", "content": prompt}],
    }
    save_session(session_id, session)

    urls = file_urls(session_id)
    success = exec_error is None and bool(code)

    result = {
        "success": success,
        "sessionId": session_id,
        "clarifiedPrompt": clarified,
        "drawingSpec": drawing_spec,
        "questions": questions,
        "answers": answers,
        "isMisleading": is_misleading,
        "code": code,
        **urls,
        "iterations": iterations,
        "error": exec_error,
    }
    _pipeline_emit(emit, {"type": "complete", "result": result})
    return result


def run_chat(data: Dict[str, Any], emit: EmitFn = None) -> Dict[str, Any]:
    session_id = data.get("sessionId")
    message = (data.get("message") or "").strip()
    if not session_id or not message:
        return {"success": False, "error": "sessionId and message are required"}

    session = load_session(session_id)
    out_dir = session_dir(session_id)
    code_llm = LLM(model_name=CODE_MODEL)

    session["history"].append({"role": "user", "content": message})

    current_code = session.get("code") or ""
    description = session.get("clarifiedPrompt") or session.get("mergedPrompt") or ""
    description = append_drawing_spec_context(description, session.get("drawingSpec"))

    _pipeline_emit(
        emit,
        {
            "type": "pipeline_start",
            "message": "Co-Pilot is updating the model based on your instruction…",
            "steps": ["Co-Pilot Edit", "Export"],
        },
    )
    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": 1,
            "stepName": "Co-Pilot Edit",
            "message": f"Understanding and applying edit: \"{message}\"…",
        },
    )

    messages = [
        {"role": "system", "content": CODE_EDIT_SYSTEM},
        {
            "role": "user",
            "content": CODE_EDIT_USER.format(
                description=description,
                code=current_code,
                instruction=message,
            ),
        },
    ]
    new_code = prepare_cadquery_code(code_llm.inference(messages=messages))

    iterations: List[Dict[str, Any]] = []
    exec_error = None
    try:
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": 1,
                "message": "Gemini is updating the CadQuery code…",
            },
        )
        assets = export_assets(new_code, out_dir)
        new_code = assets["prepared_code"]
        iter1 = make_iteration(
            1,
            "Co-Pilot Edit",
            "success",
            f"[Co-Pilot] Applied user instruction: {message}\n[Exporter] Model re-exported.",
            new_code,
        )
        iterations.append(iter1)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": 1,
                "iteration": iter1,
                "message": "Code updated and executed successfully.",
            },
        )
    except Exception as e:
        exec_error = str(e)
        try:
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": 1,
                    "message": "Execution failed — attempting auto-repair…",
                },
            )
            new_code = repair_code(new_code, exec_error, code_llm)
            assets = export_assets(new_code, out_dir)
            new_code = assets["prepared_code"]
            iter1 = make_iteration(
                1,
                "Co-Pilot Edit (repaired)",
                "success",
                f"[Repair] Fixed after edit.\n[Exporter] Model re-exported.",
                new_code,
            )
            iterations.append(iter1)
            exec_error = None
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": 1,
                    "iteration": iter1,
                    "message": "Model exported successfully after repair.",
                },
            )
        except Exception as e2:
            exec_error = str(e2)
            iter_fail = make_iteration(
                1,
                "Co-Pilot Edit — Failed",
                "exec_error",
                f"[Co-Pilot] Edit failed: {exec_error}",
                new_code,
            )
            iterations.append(iter_fail)
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": 1,
                    "iteration": iter_fail,
                    "message": f"Edit failed: {exec_error}",
                },
            )

    session["code"] = new_code
    session["history"].append(
        {
            "role": "assistant",
            "content": "Updated the CadQuery model based on your instruction."
            if not exec_error
            else f"Edit failed: {exec_error}",
        }
    )
    save_session(session_id, session)

    reply = (
        f"I updated the 3D model according to your request: \"{message}\". "
        "The viewport shows the new geometry. You can download STL/GLB/STEP below."
        if not exec_error
        else f"I tried to apply your edit but execution failed: {exec_error}"
    )

    urls = file_urls(session_id)
    result = {
        "success": exec_error is None,
        "sessionId": session_id,
        "reply": reply,
        "code": new_code,
        **urls,
        "iterations": iterations,
        "error": exec_error,
    }
    _pipeline_emit(emit, {"type": "complete", "result": result})
    return result


def _stream_emit(event: Dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def get_session_data(session_id: str) -> Dict[str, Any]:
    session = load_session(session_id)
    urls = file_urls(session_id)
    return {
        "success": True,
        "session": session,
        **urls,
    }


def run_reexecute(data: Dict[str, Any]) -> Dict[str, Any]:
    session_id = data.get("sessionId")
    if not session_id:
        return {"success": False, "error": "sessionId is required"}

    session = load_session(session_id)
    out_dir = session_dir(session_id)
    code = data.get("code") or session.get("code") or ""
    if not code:
        return {"success": False, "error": "No CadQuery code to execute"}

    try:
        assets = export_assets(code, out_dir)
        code = assets["prepared_code"]
        session["code"] = code
        save_session(session_id, session)
        urls = file_urls(session_id)
        return {
            "success": True,
            "sessionId": session_id,
            "code": code,
            **urls,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "sessionId": session_id}


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "generate"
    data = json.load(sys.stdin)

    if action == "generate":
        result = run_generate(data)
        json.dump(result, sys.stdout, ensure_ascii=False)
    elif action == "generate_stream":
        try:
            run_generate(data, emit=_stream_emit)
        except Exception as e:
            _stream_emit(
                {
                    "type": "error",
                    "error": str(e),
                    "trace": traceback.format_exc(),
                }
            )
    elif action == "chat":
        result = run_chat(data)
        json.dump(result, sys.stdout, ensure_ascii=False)
    elif action == "chat_stream":
        try:
            run_chat(data, emit=_stream_emit)
        except Exception as e:
            _stream_emit(
                {
                    "type": "error",
                    "error": str(e),
                    "trace": traceback.format_exc(),
                }
            )
    elif action == "get_session":
        session_id = data.get("sessionId")
        if not session_id:
            result = {"success": False, "error": "sessionId is required"}
        else:
            try:
                result = get_session_data(session_id)
            except FileNotFoundError as e:
                result = {"success": False, "error": str(e)}
        json.dump(result, sys.stdout, ensure_ascii=False)
    elif action == "reexecute":
        result = run_reexecute(data)
        json.dump(result, sys.stdout, ensure_ascii=False)
    else:
        result = {"success": False, "error": f"Unknown action: {action}"}
        if action.endswith("_stream"):
            _stream_emit({"type": "error", "error": result["error"]})
        else:
            json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
