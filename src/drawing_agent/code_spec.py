from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from drawing_agent.gemini_json import (
    create_client,
    dump_compact_json,
    generate_json_response,
    parse_response_as_model,
    prepare_generation,
    select_model,
)
from drawing_agent.schemas import CodeDerivedSpec, SpecValidationResult

CODE_SPEC_EXTRACT_SYSTEM = """
You extract a structured geometric specification from CadQuery Python code.

Rules:
1. Infer dimensions and features implied by the code — numeric literals, extrude depths, hole radii, etc.
2. Use mm as default_unit when the code does not specify units.
3. Do not invent geometry not present in the code.
4. Return only valid JSON matching CodeDerivedSpec.
""".strip()

CODE_VS_DRAWING_VALIDATE_SYSTEM = """
You validate whether CadQuery Python code implements a drawing-extracted specification.

Rules:
1. Set consistent=true when the built solid would match the drawing for machining purposes.
2. Compare numeric literals in the code to drawing dimensions. Accept equivalent forms:
   - diameter vs radius (Ø20 = circle(10))
   - half/double values from construction geometry
   - same value used for multiple features
3. Do NOT flag mismatches for different JSON IDs, labels, views, notes, or schema fields.
4. Do NOT flag missing entries in a secondary code-derived spec — judge the CODE directly.
5. Only report mismatches that would change the physical part (wrong size, missing hole/pocket).
6. Use severity "high" or "blocking" only for clear geometric errors; use "low" for naming/schema noise.
7. Return only valid JSON matching SpecValidationResult.
""".strip()

SPEC_VALUE_TOLERANCE_MM = 0.75
SPEC_VALUE_TOLERANCE_RATIO = 0.02
SPEC_NUMERIC_PASS_RATIO = 0.85
SPEC_NUMERIC_MAX_MISSING = 2


@dataclass
class DimDiffRow:
    id: str
    target: float
    dimension_type: str
    applies_to: str
    closest_code_value: float | None
    error: float
    ok: bool
    hint: str


def _repair_hint(
    target: float,
    dimension_type: str,
    applies_to: str,
    closest: float | None,
    ok: bool,
) -> str:
    if ok:
        return ""
    dtype = (dimension_type or "linear").lower()
    if dtype == "diameter":
        return (
            f"{applies_to}: drawing requires Ø{target} mm — use .hole({target}) or "
            f".circle({target / 2}) for cylindrical profile (circle takes RADIUS)."
        )
    if dtype == "radius":
        return (
            f"{applies_to}: drawing requires R{target} mm — use .fillet({target}) or "
            f".circle({target}); fillet/circle take radius not diameter."
        )
    if closest is not None:
        return (
            f"{applies_to}: drawing requires {target} mm but closest code literal is "
            f"{closest} mm — rename/adjust the parameter that controls this feature."
        )
    return (
        f"{applies_to}: drawing requires {target} mm ({dtype}) — add a named variable "
        f"and use it in the CadQuery operation for this feature."
    )


def closest_code_match(
    target: float,
    dimension_type: str,
    code_numbers: list[float],
    tol_mm: float = SPEC_VALUE_TOLERANCE_MM,
    tol_ratio: float = SPEC_VALUE_TOLERANCE_RATIO,
) -> tuple[float | None, float]:
    best_value: float | None = None
    best_error = float("inf")
    for candidate in dimension_equivalents(target, dimension_type):
        for code_val in code_numbers:
            delta = abs(candidate - code_val)
            if delta < best_error:
                best_error = delta
                best_value = code_val
            scale = max(abs(candidate), abs(code_val), 1.0)
            if delta / scale <= tol_ratio and delta < best_error:
                best_error = delta
                best_value = code_val
    if best_error == float("inf"):
        return None, 999.0
    return best_value, round(best_error, 3)


def build_dimension_diff(
    code: str,
    drawing_spec: dict[str, Any],
) -> list[DimDiffRow]:
    code_numbers = numeric_values_from_code(code)
    rows: list[DimDiffRow] = []
    for dim in drawing_spec.get("dimensions") or []:
        if not dim.get("explicit", True):
            continue
        value = dim.get("value")
        if value is None:
            continue
        dim_id = str(dim.get("id") or "dim")
        dtype = str(dim.get("dimension_type") or "linear")
        applies = str(dim.get("applies_to") or dim_id)
        target = float(value)
        ok = value_found_in_code(target, dtype, code_numbers)
        closest, error = closest_code_match(target, dtype, code_numbers)
        rows.append(
            DimDiffRow(
                id=dim_id,
                target=target,
                dimension_type=dtype,
                applies_to=applies,
                closest_code_value=closest,
                error=0.0 if ok else error,
                ok=ok,
                hint=_repair_hint(target, dtype, applies, closest, ok),
            )
        )
    return rows


def dimension_diff_pass(rows: list[DimDiffRow]) -> tuple[bool, float]:
    if not rows:
        return True, 1.0
    ok_count = sum(1 for row in rows if row.ok)
    ratio = ok_count / len(rows)
    failing = len(rows) - ok_count
    passed = ratio >= SPEC_NUMERIC_PASS_RATIO and failing <= SPEC_NUMERIC_MAX_MISSING
    return passed, ratio


def dimension_diff_to_comparison(rows: list[DimDiffRow]) -> list[dict[str, Any]]:
    return [
        {
            "id": row.id,
            "target": row.target,
            "measured": row.closest_code_value if row.closest_code_value is not None else -1,
            "error": row.error,
            "ok": row.ok,
        }
        for row in rows
    ]


def format_dimension_diff_for_repair(rows: list[DimDiffRow]) -> str:
    failing = [row for row in rows if not row.ok]
    if not failing:
        return "All explicit drawing dimensions are present in code literals."
    lines = ["Fix these dimension mismatches (highest priority):"]
    for row in failing[:12]:
        lines.append(
            f"- [{row.id}] target={row.target} mm ({row.dimension_type}) "
            f"→ {row.hint}"
        )
    if len(failing) > 12:
        lines.append(f"- … +{len(failing) - 12} more failing dimensions")
    return "\n".join(lines)


def _is_llm_noise_mismatch(item: Any) -> bool:
    cat = (getattr(item, "category", None) or "").lower()
    desc = (getattr(item, "description", None) or "").lower()
    if cat in ("naming", "label", "schema", "metadata", "id", "note"):
        return True
    noise_words = (
        "id mismatch",
        "label",
        "naming",
        "schema",
        "note",
        "view",
        "wording",
        "terminology",
    )
    return any(word in desc for word in noise_words)


def _is_geometry_blocking_mismatch(item: Any) -> bool:
    if _is_llm_noise_mismatch(item):
        return False
    cat = (getattr(item, "category", None) or "").lower()
    desc = (getattr(item, "description", None) or "").lower()
    if cat in ("feature", "geometry", "hole", "missing", "dimension"):
        return True
    geometry_words = (
        "missing hole",
        "missing feature",
        "wrong size",
        "wrong dimension",
        "extra hole",
        "no hole",
        "diameter",
        "radius",
        "depth",
        "height",
        "width",
        "thickness",
    )
    return any(word in desc for word in geometry_words)


def _gemini_json_call(
    system_instruction: str,
    user_prompt: str,
    response_model: type,
    model: str | None = None,
) -> Any:
    prepare_generation()
    selected_model = select_model(model)
    client = create_client()
    try:
        response = generate_json_response(
            client=client,
            model=selected_model,
            contents=[user_prompt],
            system_instruction=system_instruction,
            response_model=response_model,
        )
    finally:
        client.close()
    return parse_response_as_model(response, response_model)


def sanitize_drawing_spec_for_validation(drawing_spec: dict[str, Any]) -> dict[str, Any]:
    """Strip metadata that causes false LLM mismatches."""
    return {
        "part_name": drawing_spec.get("part_name"),
        "default_unit": drawing_spec.get("default_unit"),
        "dimensions": drawing_spec.get("dimensions") or [],
        "features": drawing_spec.get("features") or [],
    }


def numeric_values_from_code(code: str) -> list[float]:
    numbers: list[float] = []
    for match in re.finditer(r"(?<![\w.])(\d+(?:\.\d+)?)", code):
        try:
            value = float(match.group(1))
        except ValueError:
            continue
        if value > 0.05:
            numbers.append(value)
    return numbers


def dimension_equivalents(value: float, dimension_type: str | None) -> list[float]:
    equivalents = [value]
    dtype = (dimension_type or "linear").lower()
    if dtype == "diameter":
        equivalents.append(value / 2)
    elif dtype == "radius":
        equivalents.append(value * 2)
    return equivalents


def numeric_values_from_drawing_spec(drawing_spec: dict[str, Any]) -> list[tuple[float, str, str]]:
    rows: list[tuple[float, str, str]] = []
    for dim in drawing_spec.get("dimensions") or []:
        if not dim.get("explicit", True):
            continue
        value = dim.get("value")
        if value is None:
            continue
        dtype = dim.get("dimension_type") or "linear"
        applies = dim.get("applies_to") or dim.get("id") or "dimension"
        rows.append((float(value), str(dtype), str(applies)))
    return rows


def value_found_in_code(
    target: float,
    dimension_type: str,
    code_numbers: list[float],
    tol_mm: float = SPEC_VALUE_TOLERANCE_MM,
    tol_ratio: float = SPEC_VALUE_TOLERANCE_RATIO,
) -> bool:
    for candidate in dimension_equivalents(target, dimension_type):
        for code_val in code_numbers:
            delta = abs(candidate - code_val)
            if delta <= tol_mm:
                return True
            scale = max(abs(candidate), abs(code_val), 1.0)
            if delta / scale <= tol_ratio:
                return True
    return False


def deterministic_spec_check(
    code: str,
    drawing_spec: dict[str, Any],
) -> tuple[bool, str, float, list[str]]:
    drawing_rows = numeric_values_from_drawing_spec(drawing_spec)
    if not drawing_rows:
        return True, "No explicit numeric drawing dimensions to verify.", 1.0, []

    code_numbers = numeric_values_from_code(code)
    missing: list[str] = []
    for value, dtype, applies in drawing_rows:
        if not value_found_in_code(value, dtype, code_numbers):
            missing.append(f"{applies}: {value} ({dtype})")

    covered = len(drawing_rows) - len(missing)
    ratio = covered / len(drawing_rows)
    passed = ratio >= SPEC_NUMERIC_PASS_RATIO and len(missing) <= SPEC_NUMERIC_MAX_MISSING
    summary = (
        f"Numeric check: {covered}/{len(drawing_rows)} explicit drawing dimensions "
        f"found in code ({ratio:.0%})."
    )
    if missing:
        summary += f" Missing: {', '.join(missing[:6])}"
        if len(missing) > 6:
            summary += f" (+{len(missing) - 6} more)"
    return passed, summary, ratio, missing


def extract_spec_from_cadquery(
    code: str,
    *,
    model: str | None = None,
) -> CodeDerivedSpec:
    user_prompt = (
        "Extract dimensions and features from this CadQuery Python code:\n\n"
        f"{code[:12000]}"
    )
    return _gemini_json_call(
        CODE_SPEC_EXTRACT_SYSTEM,
        user_prompt,
        CodeDerivedSpec,
        model=model,
    )


def validate_code_against_drawing_spec(
    code: str,
    drawing_spec: dict[str, Any],
    *,
    model: str | None = None,
) -> SpecValidationResult:
    sanitized = sanitize_drawing_spec_for_validation(drawing_spec)
    drawing_json = json.dumps(sanitized, ensure_ascii=False)
    user_prompt = (
        "Does this CadQuery code implement the drawing specification?\n\n"
        f"DRAWING SPEC:\n{drawing_json}\n\n"
        f"CADQUERY CODE:\n{code[:12000]}\n\n"
        "Set consistent=true if the code builds the correct part. "
        "Only list mismatches that would change the physical geometry."
    )
    return _gemini_json_call(
        CODE_VS_DRAWING_VALIDATE_SYSTEM,
        user_prompt,
        SpecValidationResult,
        model=model,
    )


def validate_drawing_vs_code_spec(
    drawing_spec: dict[str, Any],
    code_spec: CodeDerivedSpec,
    *,
    model: str | None = None,
) -> SpecValidationResult:
    """Legacy JSON-to-JSON compare (kept for tooling). Prefer validate_code_against_drawing_spec."""
    sanitized = sanitize_drawing_spec_for_validation(drawing_spec)
    drawing_json = json.dumps(sanitized, ensure_ascii=False)
    code_json = dump_compact_json(code_spec)
    user_prompt = (
        "Compare drawing spec with code-derived spec.\n\n"
        f"DRAWING SPEC:\n{drawing_json}\n\n"
        f"CODE-DERIVED SPEC:\n{code_json}\n\n"
        "Accept equivalent radius/diameter and ignore ID/label differences."
    )
    return _gemini_json_call(
        CODE_VS_DRAWING_VALIDATE_SYSTEM,
        user_prompt,
        SpecValidationResult,
        model=model,
    )


def severe_mismatches(validation: SpecValidationResult) -> list[Any]:
    severe: list[Any] = []
    for item in validation.mismatches:
        sev = (item.severity or "").lower()
        if sev in ("high", "blocking"):
            severe.append(item)
    return severe


def geometry_blocking_mismatches(validation: SpecValidationResult) -> list[Any]:
    return [m for m in severe_mismatches(validation) if _is_geometry_blocking_mismatch(m)]


def validation_should_pass(
    code: str,
    drawing_spec: dict[str, Any],
    validation: SpecValidationResult,
    numeric_ratio: float,
    dim_diff: list[DimDiffRow] | None = None,
) -> bool:
    if validation.consistent:
        return True

    diff_pass, diff_ratio = (
        dimension_diff_pass(dim_diff) if dim_diff else (False, numeric_ratio)
    )
    severe = severe_mismatches(validation)
    blocking = geometry_blocking_mismatches(validation)

    if not severe:
        if diff_pass or numeric_ratio >= SPEC_NUMERIC_PASS_RATIO:
            return True
        return deterministic_spec_check(code, drawing_spec)[0]

    if diff_pass and not blocking:
        return True

    if not blocking:
        if numeric_ratio >= SPEC_NUMERIC_PASS_RATIO:
            return True
        if diff_ratio >= SPEC_NUMERIC_PASS_RATIO:
            return True

    return False
