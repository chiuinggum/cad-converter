"""
Pro-CAD interactive pipeline for WonderCAD frontend.
Invoked by server.ts: python procad_service.py <action>  (stdin: JSON, stdout: JSON)
"""

from __future__ import annotations

import ast
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

from PIL import Image

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
from src.inference import LLM
from src.mesh_utils import cadquery_to_mesh

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
CODE_MODEL = os.environ.get("CODE_GEN_MODEL", GEMINI_MODEL)
MAX_REPAIR_ATTEMPTS = int(os.environ.get("MAX_REPAIR_ATTEMPTS", "5"))
MAX_SPEC_REPAIR_ATTEMPTS = int(os.environ.get("MAX_SPEC_REPAIR_ATTEMPTS", "5"))
MAX_SPEC_VALIDATION_ATTEMPTS = int(os.environ.get("MAX_SPEC_VALIDATION_ATTEMPTS", "5"))
MAX_DIM_REPAIR_ATTEMPTS = int(os.environ.get("MAX_DIM_REPAIR_ATTEMPTS", "3"))
MAX_VISUAL_VALIDATION_ATTEMPTS = int(os.environ.get("MAX_VISUAL_VALIDATION_ATTEMPTS", "3"))
MAX_VISUAL_EXEC_REPAIR_ATTEMPTS = int(os.environ.get("MAX_VISUAL_EXEC_REPAIR_ATTEMPTS", "5"))
VISUAL_VALIDATION_MIN_SCORE = float(os.environ.get("VISUAL_VALIDATION_MIN_SCORE", "0.72"))

DEFAULT_DRAWING_ONLY_PROMPT = (
    "Reconstruct the 3D CAD model from the reference engineering drawing. "
    "Match visible dimensions, features, and overall geometry."
)

SPEC_FORMAT_REPAIR_PROMPT = """
You repair a DrawingSpec JSON that failed schema validation or JSON parsing.

Rules:
1. Return only JSON matching DrawingSpec.
2. Fix the validation or parsing errors described in the error message.
3. Stay faithful to the visible drawing — do not invent dimensions or features.
4. If a field cannot be fixed confidently, use null rather than guessing.
5. Keep IDs unique and cross-references between views, dimensions, and features consistent.
6. Do not generate CAD operations or CadQuery code.
"""

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

SPEC_MISMATCH_REPAIR_SYSTEM = """You are a CadQuery expert. Fix ONLY the listed dimension/feature mismatches.

Hard rules:
1. Output ONLY valid Python CadQuery code — no markdown, no explanations.
2. import cadquery as cq; final geometry in variable r.
3. At the top, declare EVERY drawing dimension as a named variable (use dim id as name):
   D_outer = 80
   H = 20
   Use these variables in operations — do not scatter magic numbers.
4. Change ONLY what the mismatch list requires; preserve working geometry and feature order.
5. CadQuery traps (common repair mistakes):
   - .circle(r) takes RADIUS; .hole(d) takes DIAMETER — never divide diameter by 2 for .hole()
   - .fillet(r) and .chamfer(d) — fillet uses radius, chamfer uses distance
   - extrude(H) is full height in one direction unless both=True
   - polarArray(radius=PCD/2) — radius is half of bolt circle DIAMETER
6. If a feature is missing (hole, pocket, fillet), add it without removing existing valid features."""

VISUAL_MISMATCH_REPAIR_SYSTEM = """You are a CadQuery expert. A rendered multi-view image of the model does not match the engineering drawing.

Fix the CadQuery code so orthographic views match the drawing. Rules:
1. Output ONLY valid Python — no markdown, no JSON, no prose.
2. import cadquery as cq; final geometry in variable r.
3. Make MINIMAL edits — preserve working sketches, polylines, and feature order.
4. Keep named dimension variables at the top; only change values or add missing features.
5. String literals: use straight quotes consistently; escape or use triple quotes for complex strings.
6. CadQuery: .circle(r)=radius, .hole(d)=diameter; do not break existing coordinate tuples."""


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


def validate_cadquery_syntax(code: str) -> None:
    ast.parse(code)


def ensure_valid_cadquery_code(
    code: str,
    llm: LLM,
    *,
    error_context: str = "",
    max_attempts: int = 3,
) -> str:
    prepared = prepare_cadquery_code(code)
    last_error = ""
    for attempt in range(max_attempts):
        try:
            validate_cadquery_syntax(prepared)
            return prepared
        except SyntaxError as exc:
            last_error = str(exc)
            messages = [
                {"role": "system", "content": CODE_EDIT_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"The following CadQuery code has a syntax error "
                        f"(fix attempt {attempt + 1}/{max_attempts}):\n{last_error}\n"
                        f"{error_context}\n\nCode:\n{prepared}\n\n"
                        "Fix ONLY the syntax. Return complete working code with variable r. "
                        "Use straight ASCII quotes; avoid pasting JSON into the script."
                    ),
                },
            ]
            prepared = prepare_cadquery_code(llm.inference(messages=messages))
    raise SyntaxError(
        f"CadQuery code still invalid after {max_attempts} syntax fixes: {last_error}"
    )


def format_visual_issues_for_repair(validation: Dict[str, Any]) -> str:
    issues = validation.get("issues") or []
    if not issues:
        return validation.get("summary") or "Rendered views do not match the drawing."
    lines = [f"Summary: {validation.get('summary', '')}"]
    lines.append(f"Score: {validation.get('score', 0)} (need {VISUAL_VALIDATION_MIN_SCORE})")
    lines.append("Issues to fix:")
    for issue in issues[:10]:
        sev = issue.get("severity", "?")
        desc = (issue.get("description") or "").replace("\n", " ")[:200]
        view = issue.get("view_type") or issue.get("affected_view") or ""
        prefix = f"[{sev}]"
        if view:
            prefix += f" ({view})"
        lines.append(f"- {prefix} {desc}")
    return "\n".join(lines)


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


def write_reference_image(
    image_b64: str,
    mime_type: Optional[str],
    out_dir: Path,
) -> Path:
    raw = image_b64.split("base64,")[-1] if "base64," in image_b64 else image_b64
    mime = mime_type or "image/png"
    ext = ".jpg" if "jpeg" in mime or "jpg" in mime else ".png"
    img_path = out_dir / f"reference_drawing{ext}"
    img_path.write_bytes(base64.b64decode(raw))
    return img_path


def find_reference_drawing(out_dir: Path) -> Optional[Path]:
    for name in ("reference_drawing.png", "reference_drawing.jpg", "reference_drawing.jpeg"):
        path = out_dir / name
        if path.exists():
            return path
    matches = sorted(out_dir.glob("reference_drawing.*"))
    return matches[0] if matches else None


def extract_raw_from_spec_error(error: str) -> Optional[str]:
    marker = "Raw response:\n"
    if marker in error:
        return error.split(marker, 1)[1].strip()
    return None


def repair_drawing_spec_extraction(
    img_path: Path,
    error_message: str,
    previous_raw: Optional[str] = None,
) -> Dict[str, Any]:
    from google.genai import types

    from drawing_agent.gemini_json import (
        create_client,
        generate_json_response,
        load_image_part,
        parse_response_as_model,
        prepare_generation,
    )
    from drawing_agent.schemas import DrawingSpec

    prepare_generation()
    image_part = load_image_part(img_path)
    user_prompt = (
        "The previous DrawingSpec extraction failed validation or parsing.\n\n"
        f"Error:\n{error_message[:4000]}\n\n"
        f"Previous JSON attempt:\n{(previous_raw or 'none')[:6000]}\n\n"
        "Return a corrected DrawingSpec JSON."
    )
    client = create_client()
    try:
        response = generate_json_response(
            client=client,
            model=GEMINI_MODEL,
            contents=[image_part, user_prompt],
            system_instruction=SPEC_FORMAT_REPAIR_PROMPT,
            response_model=DrawingSpec,
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        )
    finally:
        client.close()

    spec = parse_response_as_model(response, DrawingSpec)
    return json.loads(spec.model_dump_json())


def extract_drawing_spec_from_image(
    image_b64: Optional[str],
    mime_type: Optional[str],
    out_dir: Path,
) -> Optional[Dict[str, Any]]:
    if not image_b64:
        return None

    from drawing_agent.extractor import extract_drawing

    img_path = write_reference_image(image_b64, mime_type, out_dir)
    spec = extract_drawing(img_path, model=GEMINI_MODEL)
    return json.loads(spec.model_dump_json())


def extract_drawing_spec_with_repair(
    image_b64: Optional[str],
    mime_type: Optional[str],
    out_dir: Path,
    step: int,
    emit: EmitFn,
    iterations: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not image_b64:
        return None

    img_path = write_reference_image(image_b64, mime_type, out_dir)
    last_error = ""
    prior_raw: Optional[str] = None

    for attempt in range(1, MAX_SPEC_REPAIR_ATTEMPTS + 1):
        step_label = (
            "Drawing Spec Extract"
            if attempt == 1
            else f"Spec Format Repair {attempt - 1}"
        )
        _pipeline_emit(
            emit,
            {
                "type": "step_progress",
                "step": step,
                "stepName": step_label,
                "message": (
                    f"Calling {GEMINI_MODEL} for DrawingSpec JSON…"
                    if attempt == 1
                    else f"Spec repair attempt {attempt - 1}/{MAX_SPEC_REPAIR_ATTEMPTS - 1} — fixing format/validation errors…"
                ),
            },
        )
        try:
            if attempt == 1:
                from drawing_agent.extractor import extract_drawing

                spec = extract_drawing(img_path, model=GEMINI_MODEL)
                spec_dict = json.loads(spec.model_dump_json())
            else:
                spec_dict = repair_drawing_spec_extraction(
                    img_path, last_error, prior_raw
                )

            spec_logs = format_drawing_spec_log(spec_dict)
            iter_spec = make_iteration(step, step_label, "success", spec_logs, "")
            iterations.append(iter_spec)
            dim_n = len(spec_dict.get("dimensions") or [])
            feat_n = len(spec_dict.get("features") or [])
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": step,
                    "iteration": iter_spec,
                    "message": f"Drawing spec ready — {dim_n} dimensions, {feat_n} features.",
                    "drawingSpec": spec_dict,
                },
            )
            return spec_dict

        except Exception as exc:
            last_error = str(exc)
            prior_raw = extract_raw_from_spec_error(last_error) or prior_raw
            fail_logs = (
                f"[Drawing Agent] Attempt {attempt}/{MAX_SPEC_REPAIR_ATTEMPTS} failed.\n"
                f"[Drawing Agent] Error: {last_error[:1200]}"
            )

            if attempt >= MAX_SPEC_REPAIR_ATTEMPTS:
                iter_fail = make_iteration(
                    step,
                    step_label,
                    "exec_error",
                    fail_logs + "\n[Drawing Agent] Max spec repair attempts reached.",
                    "",
                )
                iterations.append(iter_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": (
                            f"Drawing spec failed after {MAX_SPEC_REPAIR_ATTEMPTS} attempts — "
                            "continuing without structured spec."
                        ),
                    },
                )
                return None

            iter_retry = make_iteration(
                step,
                step_label,
                "exec_error",
                fail_logs + "\n[Drawing Agent] Retrying with format repair…",
                "",
            )
            iterations.append(iter_retry)

    return None


def spec_for_codegen(drawing_spec: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Drop ambiguities — pipeline is fully automated; codegen uses dimensions/features only."""
    if not drawing_spec:
        return None
    out = dict(drawing_spec)
    out.pop("ambiguities", None)
    return out


def append_drawing_spec_context(text: str, drawing_spec: Optional[Dict[str, Any]]) -> str:
    sanitized = spec_for_codegen(drawing_spec)
    if not sanitized:
        return text
    return (
        text
        + "\n\nSTRUCTURED DRAWING SPEC JSON:\n"
        + json.dumps(sanitized, indent=2, ensure_ascii=False)
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
    return (
        f"Structured drawing spec available ({dim_n} dimensions, {feat_n} features)."
    )


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


def generate_code_from_request(
    prompt: str,
    llm: LLM,
    drawing_spec: Optional[Dict[str, Any]] = None,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> str:
    description = append_drawing_spec_context(prompt, drawing_spec)
    user_content = CODE_GENERATION_USER_PROMPT_TEMPLATE.format(description=description)

    if image_b64:
        raw = image_b64.split("base64,")[-1] if "base64," in image_b64 else image_b64
        mime = mime_type or "image/png"
        multimodal_prompt = (
            f"{CODE_GENERATION_SYSTEM_PROMPT}\n\n{user_content}\n\n"
            "Use the attached engineering drawing together with the prompt and structured spec."
        )
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))
            response = client.models.generate_content(
                model=CODE_MODEL,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_bytes(
                                data=base64.b64decode(raw), mime_type=mime
                            ),
                            types.Part.from_text(text=multimodal_prompt),
                        ],
                    )
                ],
            )
            text = (response.text or "").strip()
            if text:
                return prepare_cadquery_code(text)
        except Exception:
            pass

    return generate_code(description, llm)


def _parse_numeric(value: Optional[str]) -> float:
    if not value:
        return 0.0
    match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    return float(match.group()) if match else 0.0


def mismatch_to_dict(item: Any) -> Dict[str, Any]:
    if isinstance(item, dict):
        return item
    if hasattr(item, "model_dump"):
        return item.model_dump()
    return {
        "id": getattr(item, "id", ""),
        "category": getattr(item, "category", ""),
        "description": getattr(item, "description", ""),
        "drawing_value": getattr(item, "drawing_value", None),
        "code_value": getattr(item, "code_value", None),
        "severity": getattr(item, "severity", ""),
    }


def mismatches_to_comparison(
    mismatches: List[Any],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for raw in mismatches:
        item = mismatch_to_dict(raw)
        target = _parse_numeric(item.get("drawing_value"))
        measured = _parse_numeric(item.get("code_value"))
        error = abs(target - measured) if target and measured else 0.0
        rows.append(
            {
                "id": item.get("id", ""),
                "target": target,
                "measured": measured,
                "error": error,
                "ok": False,
            }
        )
    return rows


def repair_code_for_spec_mismatch(
    code: str,
    drawing_spec: Dict[str, Any],
    validation: Dict[str, Any],
    llm: LLM,
    *,
    dim_diff_text: str = "",
    blocking_mismatches: Optional[List[Dict[str, Any]]] = None,
    repair_history: Optional[List[str]] = None,
) -> str:
    sanitized_drawing = spec_for_codegen(drawing_spec) or drawing_spec
    blocking = blocking_mismatches or [
        mismatch_to_dict(m)
        for m in (validation.get("mismatches") or [])
        if (mismatch_to_dict(m).get("severity") or "").lower() in ("high", "blocking")
    ]
    history_block = ""
    if repair_history:
        history_block = (
            "\n\nPrevious repair attempts (do NOT repeat these failures):\n"
            + "\n".join(f"- {line}" for line in repair_history[-4:])
        )
    messages = [
        {"role": "system", "content": SPEC_MISMATCH_REPAIR_SYSTEM},
        {
            "role": "user",
            "content": (
                f"DIMENSION DIFF (fix these first):\n{dim_diff_text}\n\n"
                f"GEOMETRY ISSUES ({len(blocking)} blocking):\n"
                f"{json.dumps(blocking[:8], indent=2, ensure_ascii=False)}\n\n"
                f"Drawing spec:\n"
                f"{json.dumps(sanitized_drawing, indent=2, ensure_ascii=False)}\n\n"
                f"Current CadQuery code:\n{code}\n"
                f"{history_block}\n\n"
                "Return the full fixed CadQuery script with variable r."
            ),
        },
    ]
    return ensure_valid_cadquery_code(
        llm.inference(messages=messages),
        llm,
        error_context="Spec repair must return syntactically valid Python.",
    )


def validate_specs_and_repair_code(
    code: str,
    drawing_spec: Dict[str, Any],
    step: int,
    llm: LLM,
    emit: EmitFn,
    iterations: List[Dict[str, Any]],
    session_id: str,
    out_dir: Path,
) -> tuple[str, Optional[str]]:
    from drawing_agent.code_spec import (
        build_dimension_diff,
        deterministic_spec_check,
        dimension_diff_to_comparison,
        extract_spec_from_cadquery,
        format_dimension_diff_for_repair,
        geometry_blocking_mismatches,
        sanitize_drawing_spec_for_validation,
        severe_mismatches,
        validate_code_against_drawing_spec,
        validation_should_pass,
    )

    repair_round = 0
    exec_repair_round = 0
    current_code = code
    last_error = ""
    repair_history: List[str] = []
    drawing_for_validation = sanitize_drawing_spec_for_validation(drawing_spec)

    while True:
        step_label = (
            "Spec Validation" if repair_round == 0 else f"Spec Repair Attempt {repair_round}"
        )
        try:
            if repair_round == 0:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_start",
                        "step": step,
                        "stepName": step_label,
                        "message": (
                            f"Extracting spec from CadQuery and comparing with drawing spec "
                            f"({GEMINI_MODEL})…"
                        ),
                    },
                )
            else:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_progress",
                        "step": step,
                        "stepName": step_label,
                        "message": (
                            f"Re-validating after spec repair "
                            f"{repair_round}/{MAX_SPEC_VALIDATION_ATTEMPTS}…"
                        ),
                    },
                )

            numeric_pass, numeric_summary, numeric_ratio, numeric_missing = (
                deterministic_spec_check(current_code, drawing_for_validation)
            )
            dim_diff = build_dimension_diff(current_code, drawing_for_validation)
            dim_diff_text = format_dimension_diff_for_repair(dim_diff)
            if repair_round == 0:
                code_spec_model = extract_spec_from_cadquery(current_code, model=GEMINI_MODEL)
                code_spec = json.loads(code_spec_model.model_dump_json())
                dim_n = len(code_spec.get("dimensions") or [])
                feat_n = len(code_spec.get("features") or [])
                extract_log = (
                    f"[Spec Verify] Code spec extract: {dim_n} dimensions, {feat_n} features.\n"
                )
            else:
                extract_log = "[Spec Verify] Skipping code-spec re-extract on repair round.\n"
            validation_model = validate_code_against_drawing_spec(
                current_code,
                drawing_for_validation,
                model=GEMINI_MODEL,
            )
            validation = json.loads(validation_model.model_dump_json())

            logs = (
                f"[Spec Verify] Model: {GEMINI_MODEL}\n"
                f"{extract_log}"
                f"[Spec Verify] {numeric_summary}\n"
                f"[Spec Verify] Dim diff: {sum(1 for d in dim_diff if d.ok)}/{len(dim_diff)} OK.\n"
                f"[Spec Verify] LLM: {validation_model.summary}"
            )
            should_pass = validation_should_pass(
                current_code,
                drawing_for_validation,
                validation_model,
                numeric_ratio,
                dim_diff=dim_diff,
            )

            if should_pass:
                if not validation_model.consistent:
                    logs += (
                        "\n[Spec Verify] Passed — dimension diff OK; "
                        "remaining LLM flags are non-blocking."
                    )
                comparison = dimension_diff_to_comparison(dim_diff)
                if not comparison:
                    comparison = mismatches_to_comparison(validation.get("mismatches") or [])
                iter_ok = make_iteration(
                    step,
                    step_label,
                    "success",
                    logs + "\n[Spec Verify] Drawing spec and code are consistent.",
                    current_code,
                    comparison=comparison,
                )
                iterations.append(iter_ok)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_ok,
                        "message": "Spec validation passed — drawing and code specs align.",
                    },
                )
                return current_code, None

            mismatches = validation.get("mismatches") or []
            severe = severe_mismatches(validation_model)
            blocking = geometry_blocking_mismatches(validation_model)
            blocking_dicts = [mismatch_to_dict(m) for m in blocking]
            severe_dicts = [mismatch_to_dict(m) for m in severe]
            mismatch_dicts = [mismatch_to_dict(m) for m in mismatches]
            comparison = dimension_diff_to_comparison(dim_diff)
            if not comparison:
                comparison = mismatches_to_comparison(mismatch_dicts)
            failing_ids = [d.id for d in dim_diff if not d.ok]
            mismatch_lines = "\n".join(
                f"  · [{m.get('severity', '?')}] {m.get('description', '')[:120]}"
                for m in (blocking_dicts or severe_dicts or mismatch_dicts)[:8]
            )
            if failing_ids:
                mismatch_lines = (
                    f"  · Failing dims: {', '.join(failing_ids[:8])}\n" + mismatch_lines
                )
            mismatch_logs = (
                logs
                + f"\n[Spec Verify] {len(blocking)} geometry-blocking / "
                f"{len(severe)} severe / {len(mismatches)} total issue(s):\n"
                + mismatch_lines
            )

            if repair_round >= MAX_SPEC_VALIDATION_ATTEMPTS:
                iter_fail = make_iteration(
                    step,
                    step_label,
                    "mismatch",
                    mismatch_logs
                    + f"\n[Spec Verify] Stopped after {MAX_SPEC_VALIDATION_ATTEMPTS} attempts.",
                    current_code,
                    comparison=comparison,
                    failing=["spec_mismatch"],
                )
                iterations.append(iter_fail)
                last_error = validation_model.summary or "Spec validation failed"
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": (
                            f"Spec validation failed after "
                            f"{MAX_SPEC_VALIDATION_ATTEMPTS} repair attempts."
                        ),
                    },
                )
                return current_code, last_error

            repair_round += 1
            failing_summary = (
                f"dims={failing_ids[:6]} blocking={len(blocking)}"
            )
            repair_history.append(f"attempt {repair_round}: still failing ({failing_summary})")
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": step,
                    "stepName": f"Spec Repair Attempt {repair_round}",
                    "message": (
                        f"Spec mismatch — repairing CadQuery "
                        f"({repair_round}/{MAX_SPEC_VALIDATION_ATTEMPTS})…"
                    ),
                },
            )
            try:
                current_code = repair_code_for_spec_mismatch(
                    current_code,
                    drawing_for_validation,
                    validation,
                    llm,
                    dim_diff_text=dim_diff_text,
                    blocking_mismatches=blocking_dicts,
                    repair_history=repair_history,
                )
                try:
                    export_assets(current_code, out_dir)
                    exec_repair_round = 0
                except Exception as export_exc:
                    exec_repair_round += 1
                    if exec_repair_round >= MAX_REPAIR_ATTEMPTS:
                        raise RuntimeError(
                            f"Spec-repaired code failed to execute after "
                            f"{MAX_REPAIR_ATTEMPTS} attempts: {export_exc}"
                        ) from export_exc
                    current_code = repair_code(current_code, str(export_exc), llm)
                    export_assets(current_code, out_dir)
                    exec_repair_round = 0
                iter_repair = make_iteration(
                    step,
                    f"Spec Repair Attempt {repair_round}",
                    "success",
                    mismatch_logs
                    + f"\n[Spec Verify] Repaired code ({len(current_code)} chars).\n"
                    + f"[Spec Verify] Repair focus:\n{dim_diff_text[:800]}",
                    current_code,
                    comparison=comparison,
                )
                iterations.append(iter_repair)
                export_and_emit_preview(
                    current_code,
                    out_dir,
                    session_id,
                    f"spec_repair_{repair_round}",
                    f"Spec repair #{repair_round}",
                    f"preview_spec_repair_{repair_round}",
                    emit,
                )
            except Exception as repair_exc:
                repair_err = str(repair_exc)
                iter_fail = make_iteration(
                    step,
                    f"Spec Repair Attempt {repair_round}",
                    "exec_error",
                    f"[Spec Verify] Repair failed: {repair_err}",
                    current_code,
                    comparison=comparison,
                    failing=["spec_repair"],
                )
                iterations.append(iter_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": f"Spec repair failed: {repair_err}",
                    },
                )
                return current_code, repair_err

        except Exception as exc:
            last_error = str(exc)
            exec_repair_round += 1
            if exec_repair_round >= MAX_REPAIR_ATTEMPTS and repair_round >= MAX_SPEC_VALIDATION_ATTEMPTS:
                iter_fail = make_iteration(
                    step,
                    step_label,
                    "exec_error",
                    f"[Spec Verify] Error: {last_error[:1200]}",
                    current_code,
                    failing=["spec_validation"],
                )
                iterations.append(iter_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": f"Spec validation error: {last_error[:200]}",
                    },
                )
                return current_code, last_error
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": step,
                    "stepName": step_label,
                    "message": (
                        f"Spec validation error — repair agent fixing code "
                        f"({last_error[:200]})…"
                    ),
                },
            )
            try:
                current_code = repair_code(current_code, last_error, llm)
                export_assets(current_code, out_dir)
                exec_repair_round = 0
            except Exception:
                pass


def execute_and_export_with_repair(
    code: str,
    out_dir: Path,
    step: int,
    code_llm: LLM,
    emit: EmitFn,
    iterations: List[Dict[str, Any]],
    drawing_spec: Optional[Dict[str, Any]] = None,
) -> tuple[str, Optional[str]]:
    repair_round = 0
    dim_repair_round = 0
    current_code = code
    # Best (lowest max-error) version seen so far, for graceful degradation.
    best: Optional[tuple[str, List[Dict[str, Any]], float]] = None
    dim_repair_history: List[str] = []

    while True:
        attempt_no = repair_round + dim_repair_round
        step_label = (
            "Execute & Export" if attempt_no == 0 else f"Repair Attempt {attempt_no}"
        )
        try:
            if repair_round == 0:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_start",
                        "step": step,
                        "stepName": step_label,
                        "message": "Running CadQuery in sandbox and exporting STL / GLB / STEP…",
                    },
                )
            else:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_progress",
                        "step": step,
                        "stepName": step_label,
                        "message": f"Re-running repaired code (attempt {repair_round}/{MAX_REPAIR_ATTEMPTS})…",
                    },
                )

            assets = export_assets(current_code, out_dir)
            prepared = assets["prepared_code"]
            measured = assets.get("measured") or {}

            comparison: Optional[List[Dict[str, Any]]] = None
            dim_diff = None
            dim_passed = True
            dim_diff_text = ""
            measure_summary = ""
            if drawing_spec and measured and not measured.get("_error"):
                from drawing_agent.code_spec import (
                    build_dimension_diff_from_measurement,
                    dimension_diff_pass,
                    dimension_diff_to_comparison,
                    format_dimension_diff_for_repair,
                )

                dim_diff = build_dimension_diff_from_measurement(measured, drawing_spec)
                if dim_diff:
                    comparison = dimension_diff_to_comparison(dim_diff)
                    ok_count = sum(1 for row in dim_diff if row.ok)
                    dim_passed, _ = dimension_diff_pass(dim_diff)
                    max_error = max((row.error for row in dim_diff), default=0.0)
                    dim_diff_text = format_dimension_diff_for_repair(dim_diff)
                    measure_summary = (
                        f"\n[Measure] Independent geometry check: {ok_count}/{len(dim_diff)} "
                        f"drawing dimensions within tolerance "
                        f"({'PASS' if dim_passed else 'see failing dims'})."
                    )
                    # Track the closest-to-spec version for graceful degradation.
                    if best is None or max_error < best[2]:
                        best = (prepared, comparison, max_error)

            exec_log = (
                "[Sandbox] CadQuery executed successfully.\n[Exporter] STL, GLB, STEP exported."
                if attempt_no == 0
                else f"[Repair] Attempt {attempt_no} executed.\n[Exporter] STL, GLB, STEP exported."
            )

            # Dimensional mismatch: feed the failing measured dims back to the
            # build agent and retry — the loop converges on a real error signal.
            if dim_diff and not dim_passed:
                failing_ids = [row.id for row in dim_diff if not row.ok]
                if dim_repair_round < MAX_DIM_REPAIR_ATTEMPTS:
                    dim_repair_round += 1
                    iter_mismatch = make_iteration(
                        step,
                        step_label,
                        "mismatch",
                        exec_log
                        + measure_summary
                        + f"\n[Measure] Dimensional mismatch — repairing "
                        f"({dim_repair_round}/{MAX_DIM_REPAIR_ATTEMPTS}). "
                        f"Failing: {failing_ids}",
                        prepared,
                        comparison=comparison,
                        failing=failing_ids,
                    )
                    iterations.append(iter_mismatch)
                    _pipeline_emit(
                        emit,
                        {
                            "type": "step_progress",
                            "step": step,
                            "stepName": f"Repair Attempt {repair_round + dim_repair_round}",
                            "message": (
                                f"Measured dims off target — repair agent fixing "
                                f"{failing_ids[:6]} "
                                f"({dim_repair_round}/{MAX_DIM_REPAIR_ATTEMPTS})…"
                            ),
                        },
                    )
                    dim_repair_history.append(
                        f"attempt {dim_repair_round}: still failing {failing_ids[:6]}"
                    )
                    try:
                        current_code = repair_code_for_spec_mismatch(
                            current_code,
                            drawing_spec,
                            {"mismatches": []},
                            code_llm,
                            dim_diff_text=dim_diff_text,
                            repair_history=dim_repair_history,
                        )
                        continue
                    except Exception as repair_exc:
                        # Could not generate a fix — fall through to degrade.
                        dim_repair_history.append(f"repair error: {repair_exc}")

                # Budget exhausted (or repair failed): deliver the best version.
                best_code, best_comparison, _ = best or (prepared, comparison or [], 0.0)
                if best_code != prepared:
                    try:
                        export_assets(best_code, out_dir)  # re-export so files match best
                    except Exception:
                        best_code, best_comparison = prepared, comparison or []
                best_failing = [c["id"] for c in best_comparison if not c["ok"]]
                iter_degraded = make_iteration(
                    step,
                    step_label,
                    "mismatch",
                    exec_log
                    + measure_summary
                    + f"\n[Measure] Stopped after {MAX_DIM_REPAIR_ATTEMPTS} dimensional "
                    f"repair attempts — delivering closest version (graceful degradation). "
                    f"Remaining: {best_failing}",
                    best_code,
                    comparison=best_comparison,
                    failing=best_failing,
                )
                iterations.append(iter_degraded)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_degraded,
                        "message": (
                            "Delivered closest model — some dimensions remain out of "
                            "tolerance (see metrology table)."
                        ),
                    },
                )
                return best_code, None

            iter_ok = make_iteration(
                step, step_label, "success", exec_log + measure_summary, prepared,
                comparison=comparison,
            )
            iterations.append(iter_ok)
            _pipeline_emit(
                emit,
                {
                    "type": "step_done",
                    "step": step,
                    "iteration": iter_ok,
                    "message": "3D model ready — exports available.",
                },
            )
            return prepared, None

        except Exception as exc:
            exec_error = str(exc)
            if repair_round >= MAX_REPAIR_ATTEMPTS:
                iter_fail = make_iteration(
                    step,
                    step_label,
                    "exec_error",
                    f"[Sandbox] Execution failed:\n{exec_error}\n"
                    f"[Repair] Stopped after {MAX_REPAIR_ATTEMPTS} repair attempts.",
                    current_code,
                )
                iterations.append(iter_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": f"Pipeline failed after {MAX_REPAIR_ATTEMPTS} repair attempts.",
                    },
                )
                return current_code, exec_error

            repair_round += 1
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": step,
                    "stepName": f"Repair Attempt {repair_round}",
                    "message": (
                        f"Execution error — repair agent attempt "
                        f"{repair_round}/{MAX_REPAIR_ATTEMPTS}…\n{exec_error[:400]}"
                    ),
                },
            )
            try:
                current_code = repair_code(current_code, exec_error, code_llm)
                iter_repair = make_iteration(
                    step,
                    f"Repair Attempt {repair_round}",
                    "success",
                    f"[Repair] Generated fix ({len(current_code)} chars).\n"
                    f"[Repair] Previous error:\n{exec_error[:600]}",
                    current_code,
                )
                iterations.append(iter_repair)
            except Exception as repair_exc:
                repair_err = str(repair_exc)
                iter_fail = make_iteration(
                    step,
                    f"Repair Attempt {repair_round}",
                    "exec_error",
                    f"[Repair] Could not generate fix: {repair_err}",
                    current_code,
                )
                iterations.append(iter_fail)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iter_fail,
                        "message": f"Repair agent failed: {repair_err}",
                    },
                )
                return current_code, repair_err


def repair_code(code: str, error: str, llm: LLM) -> str:
    messages = [
        {"role": "system", "content": CODE_EDIT_SYSTEM},
        {
            "role": "user",
            "content": (
                f"The following CadQuery code failed:\n{error}\n\nCode:\n{code}\n\n"
                "Fix and return working code with variable r. "
                "Make minimal changes; preserve polylines and named variables."
            ),
        },
    ]
    return ensure_valid_cadquery_code(
        llm.inference(messages=messages),
        llm,
        error_context="Execution repair must return syntactically valid Python.",
    )


def export_assets(code: str, out_dir: Path) -> Dict[str, Any]:
    import cadquery as cq

    from src.mesh_utils import cadquery_result_to_mesh

    from drawing_agent.geometry import measure_solid

    prepared = prepare_cadquery_code(code)
    out_dir.mkdir(parents=True, exist_ok=True)

    namespace: Dict[str, Any] = {"cq": cq}
    # Executed once here (the previous code exec'd twice). A runaway/hung build
    # is bounded by the per-request kill-timeout enforced in server.ts.
    exec(prepared, namespace)
    r = namespace.get("r") or namespace.get("result")
    if r is None:
        raise ValueError("Code must define variable r (or result) with CadQuery geometry")

    solid = r.val()
    if not solid.isValid():
        raise ValueError("CadQuery code executed but produced no valid solid")

    mesh = cadquery_result_to_mesh(r)

    stl_path = out_dir / "model.stl"
    glb_path = out_dir / "model.glb"
    step_path = out_dir / "model.step"
    py_path = out_dir / "generated.py"

    mesh.export(str(stl_path))
    mesh.export(str(glb_path))
    cq.exporters.export(r, str(step_path))
    with open(py_path, "w", encoding="utf-8") as f:
        f.write(prepared)

    # Independent geometric measurement (best-effort; never breaks the export).
    try:
        measured = measure_solid(r)
    except Exception as exc:
        measured = {"_error": str(exc)}

    return {
        "stl": str(stl_path),
        "glb": str(glb_path),
        "step": str(step_path),
        "py": str(py_path),
        "prepared_code": prepared,
        "measured": measured,
    }


def make_iteration(
    attempt: int,
    step_name: str,
    status: str,
    logs: str,
    code: str = "",
    comparison: Optional[List[Dict[str, Any]]] = None,
    failing: Optional[List[str]] = None,
    image_urls: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "attempt": attempt,
        "stepName": step_name,
        "status": status,
        "logs": logs,
        "code": code,
        "comparison": comparison,
        "imageUrls": image_urls or [],
        "failing": (
            failing
            if failing is not None
            else ([] if status == "success" else ["execution"])
        ),
    }


def session_file_url(session_id: str, filename: str) -> str:
    return f"/api/procad/files/{session_id}/{filename}"


def build_pipeline_steps(pipeline_method: str, has_image: bool) -> List[str]:
    steps: List[str] = []
    if has_image and pipeline_method == "v4":
        steps.append("View Decouple")
    if has_image and pipeline_method != "v1":
        steps.append("Drawing Spec Extract")
    steps.append("CadQuery Generation")
    if has_image and pipeline_method in ("v3", "v4"):
        steps.append("Spec Validation")
    steps.append("Execute & Export")
    if has_image and pipeline_method == "v4":
        steps.append("Visual Validation")
    return steps


def pipeline_step_index(steps: List[str], name: str) -> int:
    return steps.index(name) + 1


def file_urls(session_id: str) -> Dict[str, str]:
    base = f"/api/procad/files/{session_id}"
    return {
        "glbUrl": f"{base}/model.glb",
        "stlUrl": f"{base}/model.stl",
        "stepUrl": f"{base}/model.step",
        "pyUrl": f"{base}/generated.py",
    }


def preview_glb_url(session_id: str, basename: str) -> str:
    return f"/api/procad/files/{session_id}/{basename}.glb"


def try_export_preview_glb(code: str, out_dir: Path, basename: str) -> Optional[str]:
    """Export GLB only for live viewport preview (non-fatal on failure)."""
    try:
        prepared = prepare_cadquery_code(code)
        mesh = cadquery_to_mesh(prepared)
        glb_path = out_dir / f"{basename}.glb"
        mesh.export(str(glb_path))
        return str(glb_path)
    except Exception:
        return None


def emit_model_preview(
    emit: EmitFn,
    session_id: str,
    preview_id: str,
    label: str,
    basename: str,
) -> None:
    _pipeline_emit(
        emit,
        {
            "type": "model_preview",
            "previewId": preview_id,
            "label": label,
            "glbUrl": preview_glb_url(session_id, basename),
            "sessionId": session_id,
        },
    )


def export_and_emit_preview(
    code: str,
    out_dir: Path,
    session_id: str,
    preview_id: str,
    label: str,
    basename: str,
    emit: EmitFn,
) -> bool:
    path = try_export_preview_glb(code, out_dir, basename)
    if not path:
        return False
    emit_model_preview(emit, session_id, preview_id, label, basename)
    return True


def repair_code_for_visual_mismatch(
    code: str,
    validation: Dict[str, Any],
    drawing_spec: Optional[Dict[str, Any]],
    llm: LLM,
) -> str:
    issues_text = format_visual_issues_for_repair(validation)
    spec_block = ""
    if drawing_spec:
        sanitized = spec_for_codegen(drawing_spec) or drawing_spec
        dims = sanitized.get("dimensions") or []
        dim_lines = [
            f"  {d.get('id')}: {d.get('value')} {d.get('unit', 'mm')} → {d.get('applies_to', '')[:60]}"
            for d in dims[:20]
        ]
        spec_block = "Key drawing dimensions:\n" + "\n".join(dim_lines) + "\n\n"
    messages = [
        {"role": "system", "content": VISUAL_MISMATCH_REPAIR_SYSTEM},
        {
            "role": "user",
            "content": (
                f"{issues_text}\n\n"
                f"{spec_block}"
                f"Current CadQuery code:\n{code}\n\n"
                "Apply minimal fixes so rendered views match the drawing. "
                "Return the full script with variable r."
            ),
        },
    ]
    return ensure_valid_cadquery_code(
        llm.inference(messages=messages),
        llm,
        error_context="Visual repair must return syntactically valid Python with variable r.",
        max_attempts=3,
    )


def run_view_decouple_step(
    image_b64: str,
    mime_type: Optional[str],
    out_dir: Path,
    step: int,
    session_id: str,
    emit: EmitFn,
    iterations: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    from drawing_agent.view_decouple import decouple_drawing_views

    img_path = write_reference_image(image_b64, mime_type, out_dir)
    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": step,
            "stepName": "View Decouple",
            "message": f"Detecting orthographic/perspective view types ({GEMINI_MODEL})…",
        },
    )
    try:
        decouple_model = decouple_drawing_views(img_path, model=GEMINI_MODEL)
        decouple = json.loads(decouple_model.model_dump_json())

        view_lines = []
        for view in decouple.get("views") or []:
            projection = view.get("projection", "?")
            view_type = view.get("view_type", "?")
            label = view.get("label") or f"{view_type} ({projection})"
            view_lines.append(f"  · {view.get('id', '?')}: {label}")

        image_urls = [session_file_url(session_id, img_path.name)]
        logs = (
            f"[View Decouple] Model: {GEMINI_MODEL}\n"
            f"[View Decouple] Detected {len(decouple.get('views') or [])} view type(s):\n"
            + "\n".join(view_lines)
            + f"\n[View Decouple] Full drawing saved: {img_path.name}"
        )
        iteration = make_iteration(
            step,
            "View Decouple",
            "success",
            logs,
            image_urls=image_urls,
        )
        iterations.append(iteration)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step,
                "iteration": iteration,
                "message": (
                    f"Identified {len(decouple.get('views') or [])} view types — "
                    "no cropping; full drawing kept for comparison."
                ),
                "imageUrls": image_urls,
            },
        )
        return decouple
    except Exception as exc:
        err = str(exc)
        iteration = make_iteration(
            step,
            "View Decouple",
            "exec_error",
            f"[View Decouple] Failed: {err}",
            image_urls=[session_file_url(session_id, img_path.name)],
        )
        iterations.append(iteration)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step,
                "iteration": iteration,
                "message": f"View decouple failed: {err[:180]}",
                "imageUrls": iteration.get("imageUrls"),
            },
        )
        return None


def run_visual_validation_step(
    code: str,
    decouple: Dict[str, Any],
    drawing_spec: Optional[Dict[str, Any]],
    out_dir: Path,
    step: int,
    session_id: str,
    llm: LLM,
    emit: EmitFn,
    iterations: List[Dict[str, Any]],
) -> tuple[str, Optional[str]]:
    from drawing_agent.schemas import ViewDecoupleResult
    from drawing_agent.visual_validation import (
        compare_drawing_with_render_composite,
        compose_side_by_side,
        render_model_view_composite,
        visual_validation_should_pass,
    )

    repair_round = 0
    exec_repair_round = 0
    current_code = code
    last_working_code = code
    decouple_model = ViewDecoupleResult.model_validate(decouple)
    reference_path = find_reference_drawing(out_dir)
    last_error = ""

    def run_render_pipeline(prepared: str):
        mesh = cadquery_to_mesh(prepared)
        render_composite = render_model_view_composite(
            mesh,
            decouple_model,
            out_dir,
        )
        render_path = out_dir / "render_views_composite.jpg"
        if reference_path and reference_path.exists():
            side_by_side = compose_side_by_side(
                Image.open(reference_path).convert("RGB"),
                render_composite,
            )
            side_by_side.save(out_dir / "visual_compare_side_by_side.jpg", format="JPEG", quality=92)
        return mesh

    while True:
        step_label = (
            "Visual Validation" if repair_round == 0 else f"Visual Repair Attempt {repair_round}"
        )
        try:
            if repair_round == 0:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_start",
                        "step": step,
                        "stepName": step_label,
                        "message": (
                            f"Rendering matched views and comparing with drawing ({GEMINI_MODEL})…"
                        ),
                    },
                )
            else:
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_progress",
                        "step": step,
                        "stepName": step_label,
                        "message": (
                            f"Re-rendering after visual repair "
                            f"{repair_round}/{MAX_VISUAL_VALIDATION_ATTEMPTS}…"
                        ),
                    },
                )

            prepared = ensure_valid_cadquery_code(
                current_code,
                llm,
                error_context="Code must compile before visual render.",
            )
            current_code = prepared
            run_render_pipeline(prepared)
            render_path = out_dir / "render_views_composite.jpg"
            last_working_code = prepared
            exec_repair_round = 0

            if not reference_path or not reference_path.exists():
                raise FileNotFoundError("reference_drawing not found in session output")

            validation_model = compare_drawing_with_render_composite(
                reference_path,
                render_path,
                decouple_model,
                model=GEMINI_MODEL,
            )
            validation = json.loads(validation_model.model_dump_json())
            should_pass = visual_validation_should_pass(
                validation_model,
                min_score=VISUAL_VALIDATION_MIN_SCORE,
            )

            ref_url = session_file_url(session_id, reference_path.name)
            image_urls = [
                ref_url,
                session_file_url(session_id, "render_views_composite.jpg"),
                session_file_url(session_id, "visual_compare_side_by_side.jpg"),
            ]
            issue_lines = "\n".join(
                f"  · [{issue.get('severity', '?')}] {issue.get('description', '')[:120]}"
                for issue in (validation.get("issues") or [])[:8]
            )
            logs = (
                f"[Visual Verify] Model: {GEMINI_MODEL}\n"
                f"[Visual Verify] Score: {validation.get('score', 0):.2f} "
                f"(min {VISUAL_VALIDATION_MIN_SCORE})\n"
                f"[Visual Verify] {validation.get('summary', '')}\n"
                + (f"[Visual Verify] Issues:\n{issue_lines}" if issue_lines else "")
            )

            if should_pass:
                iteration = make_iteration(
                    step,
                    step_label,
                    "success",
                    logs + "\n[Visual Verify] Drawing views and rendered model align.",
                    current_code,
                    image_urls=image_urls,
                )
                iterations.append(iteration)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iteration,
                        "message": "Visual validation passed — rendered views match the drawing.",
                        "imageUrls": image_urls,
                    },
                )
                return current_code, None

            if repair_round >= MAX_VISUAL_VALIDATION_ATTEMPTS:
                iteration = make_iteration(
                    step,
                    step_label,
                    "mismatch",
                    logs
                    + f"\n[Visual Verify] Stopped after {MAX_VISUAL_VALIDATION_ATTEMPTS} attempts.",
                    last_working_code,
                    image_urls=image_urls,
                    failing=["visual_mismatch"],
                )
                iterations.append(iteration)
                last_error = validation.get("summary") or "Visual validation failed"
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iteration,
                        "message": (
                            f"Visual validation failed after "
                            f"{MAX_VISUAL_VALIDATION_ATTEMPTS} repair attempts."
                        ),
                        "imageUrls": image_urls,
                    },
                )
                return last_working_code, last_error

            repair_round += 1
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": step,
                    "stepName": f"Visual Repair Attempt {repair_round}",
                    "message": (
                        f"Visual mismatch — repairing CadQuery "
                        f"({repair_round}/{MAX_VISUAL_VALIDATION_ATTEMPTS})…"
                    ),
                },
            )
            current_code = repair_code_for_visual_mismatch(
                current_code,
                validation,
                drawing_spec,
                llm,
            )
            try:
                export_assets(current_code, out_dir)
                exec_repair_round = 0
            except Exception as export_exc:
                exec_repair_round += 1
                if exec_repair_round >= MAX_VISUAL_EXEC_REPAIR_ATTEMPTS:
                    current_code = last_working_code
                    raise RuntimeError(
                        f"Visual repair code failed to execute after "
                        f"{MAX_VISUAL_EXEC_REPAIR_ATTEMPTS} fix attempts: {export_exc}"
                    ) from export_exc
                last_error = str(export_exc)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_progress",
                        "step": step,
                        "stepName": f"Visual Exec Repair {exec_repair_round}",
                        "message": (
                            f"Repaired code failed to execute — fixing "
                            f"({exec_repair_round}/{MAX_VISUAL_EXEC_REPAIR_ATTEMPTS})…"
                        ),
                    },
                )
                current_code = repair_code(last_working_code, last_error, llm)
                export_assets(current_code, out_dir)
                last_working_code = current_code
                exec_repair_round = 0
                continue
            export_and_emit_preview(
                current_code,
                out_dir,
                session_id,
                f"visual_repair_{repair_round}",
                f"Visual Repair {repair_round}",
                f"preview_visual_repair_{repair_round}",
                emit,
            )
        except Exception as exc:
            last_error = str(exc)
            exec_repair_round += 1
            if exec_repair_round >= MAX_VISUAL_EXEC_REPAIR_ATTEMPTS:
                iteration = make_iteration(
                    step,
                    step_label,
                    "exec_error",
                    f"[Visual Verify] Error: {last_error}\n"
                    f"[Visual Verify] Stopped after {MAX_VISUAL_EXEC_REPAIR_ATTEMPTS} "
                    "execution repair attempts.",
                    last_working_code,
                    failing=["visual_validation_error"],
                )
                iterations.append(iteration)
                _pipeline_emit(
                    emit,
                    {
                        "type": "step_done",
                        "step": step,
                        "iteration": iteration,
                        "message": f"Visual validation error: {last_error[:180]}",
                    },
                )
                return last_working_code, last_error
            current_code = last_working_code
            _pipeline_emit(
                emit,
                {
                    "type": "step_progress",
                    "step": step,
                    "stepName": f"Visual Exec Repair {exec_repair_round}",
                    "message": (
                        f"Render/execute error — repair agent fixing from last good code "
                        f"({exec_repair_round}/{MAX_VISUAL_EXEC_REPAIR_ATTEMPTS}): "
                        f"{last_error[:200]}"
                    ),
                },
            )
            try:
                current_code = repair_code(last_working_code, last_error, llm)
                export_assets(current_code, out_dir)
                last_working_code = current_code
                exec_repair_round = 0
            except Exception as repair_exc:
                last_error = str(repair_exc)
                continue


EmitFn = Optional[Callable[[Dict[str, Any]], None]]


def _pipeline_emit(emit: EmitFn, event: Dict[str, Any]) -> None:
    if emit:
        emit(event)


def run_generate(data: Dict[str, Any], emit: EmitFn = None) -> Dict[str, Any]:
    has_image = bool(data.get("image"))
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        if has_image:
            prompt = DEFAULT_DRAWING_ONLY_PROMPT
        else:
            return {"success": False, "error": "prompt or image is required"}

    session_id = data.get("sessionId") or str(uuid.uuid4())
    out_dir = session_dir(session_id)
    iterations: List[Dict[str, Any]] = []
    drawing_spec: Optional[Dict[str, Any]] = None
    view_decouple: Optional[Dict[str, Any]] = None
    pipeline_method = (data.get("pipelineMethod") or "v1").strip().lower()
    use_spec_extract = has_image and pipeline_method != "v1"
    use_spec_validation = pipeline_method in ("v3", "v4") and use_spec_extract
    use_view_decouple = has_image and pipeline_method == "v4"
    use_visual_validation = has_image and pipeline_method == "v4"

    pipeline_steps = build_pipeline_steps(pipeline_method, has_image)
    step_spec = pipeline_step_index(pipeline_steps, "Drawing Spec Extract") if use_spec_extract else None
    step_coder = pipeline_step_index(pipeline_steps, "CadQuery Generation")
    step_validation = (
        pipeline_step_index(pipeline_steps, "Spec Validation")
        if use_spec_validation
        else None
    )
    step_sandbox = pipeline_step_index(pipeline_steps, "Execute & Export")
    step_visual = (
        pipeline_step_index(pipeline_steps, "Visual Validation")
        if use_visual_validation
        else None
    )
    step_view_decouple = (
        pipeline_step_index(pipeline_steps, "View Decouple")
        if use_view_decouple
        else None
    )
    codegen_description = append_drawing_spec_context(prompt, drawing_spec)

    if pipeline_method == "v4":
        method_label = "V4 (view decouple + spec + visual validation)"
    elif pipeline_method == "v3":
        method_label = "V3 (spec + codegen + spec validation)"
    elif pipeline_method == "v2":
        method_label = "V2 (spec + codegen)"
    else:
        method_label = "V1 (direct codegen)"
    _pipeline_emit(
        emit,
        {
            "type": "pipeline_start",
            "message": f"Starting agent pipeline [{method_label}]",
            "steps": pipeline_steps,
        },
    )

    code_llm = LLM(model_name=CODE_MODEL)
    code = ""
    exec_error: Optional[str] = None
    visual_validation_warning: Optional[str] = None
    export_succeeded = False

    if use_view_decouple and step_view_decouple is not None:
        view_decouple = run_view_decouple_step(
            data.get("image"),
            data.get("imageType"),
            out_dir,
            step_view_decouple,
            session_id,
            emit,
            iterations,
        )

    if use_spec_extract and step_spec is not None:
        _pipeline_emit(
            emit,
            {
                "type": "step_start",
                "step": step_spec,
                "stepName": "Drawing Spec Extract",
                "message": "Extracting structured dimensions and features from the drawing…",
            },
        )
        drawing_spec = extract_drawing_spec_with_repair(
            data.get("image"),
            data.get("imageType"),
            out_dir,
            step_spec,
            emit,
            iterations,
        )
        if drawing_spec:
            codegen_description = append_drawing_spec_context(prompt, drawing_spec)

    _pipeline_emit(
        emit,
        {
            "type": "step_start",
            "step": step_coder,
            "stepName": "CadQuery Generation",
            "message": f"Generating CadQuery with {CODE_MODEL} (prompt + drawing spec + image)…",
        },
    )
    try:
        code = generate_code_from_request(
            prompt,
            code_llm,
            drawing_spec,
            data.get("image"),
            data.get("imageType"),
        )
        iter_coder = make_iteration(
            step_coder,
            "CadQuery Generation",
            "success",
            f"[Coder] Model: {CODE_MODEL}\n"
            f"[Coder] Prompt + spec context: {len(codegen_description)} chars.\n"
            f"[Coder] Reference image: {'yes' if has_image else 'no'}\n"
            f"[Coder] Generated {len(code)} chars.\n[Coder] Preview:\n"
            f"{code[:500]}{'…' if len(code) > 500 else ''}",
            code,
        )
        iterations.append(iter_coder)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_coder,
                "iteration": iter_coder,
                "message": f"CadQuery code generated ({len(code)} characters).",
            },
        )
        export_and_emit_preview(
            code,
            out_dir,
            session_id,
            "codegen",
            "Codegen (Step 2)",
            "preview_codegen",
            emit,
        )
        if use_spec_validation and drawing_spec and step_validation is not None:
            code, exec_error = validate_specs_and_repair_code(
                code,
                drawing_spec,
                step_validation,
                code_llm,
                emit,
                iterations,
                session_id,
                out_dir,
            )
        if not exec_error:
            code, exec_error = execute_and_export_with_repair(
                code, out_dir, step_sandbox, code_llm, emit, iterations, drawing_spec
            )
            export_succeeded = exec_error is None
        if (
            not exec_error
            and use_visual_validation
            and view_decouple
            and step_visual is not None
        ):
            code, visual_error = run_visual_validation_step(
                code,
                view_decouple,
                drawing_spec,
                out_dir,
                step_visual,
                session_id,
                code_llm,
                emit,
                iterations,
            )
            if visual_error:
                visual_validation_warning = visual_error
                if export_succeeded:
                    exec_error = None
    except Exception as exc:
        exec_error = str(exc)
        iter_fail = make_iteration(
            step_coder,
            "CadQuery Generation",
            "exec_error",
            f"[Coder] Code generation failed: {exec_error}",
            code,
        )
        iterations.append(iter_fail)
        _pipeline_emit(
            emit,
            {
                "type": "step_done",
                "step": step_coder,
                "iteration": iter_fail,
                "message": f"CadQuery generation failed: {exec_error}",
            },
        )

    session = {
        "sessionId": session_id,
        "prompt": prompt,
        "mergedPrompt": prompt,
        "clarifiedPrompt": codegen_description,
        "drawingSpec": drawing_spec,
        "viewDecouple": view_decouple,
        "pipelineMethod": pipeline_method,
        "code": code,
        "history": [{"role": "user", "content": prompt}],
    }
    save_session(session_id, session)

    urls = file_urls(session_id)
    success = exec_error is None and bool(code)

    result = {
        "success": success,
        "sessionId": session_id,
        "clarifiedPrompt": codegen_description,
        "drawingSpec": drawing_spec,
        "viewDecouple": view_decouple,
        "pipelineMethod": pipeline_method,
        "code": code,
        **urls,
        "iterations": iterations,
        "error": exec_error,
        "visualValidationWarning": visual_validation_warning,
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
