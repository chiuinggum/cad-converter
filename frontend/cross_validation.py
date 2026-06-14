"""Dual-model cross-validation helpers for V5 (Gemini + GPT via Pioneer)."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

CROSS_SPEC_VALUE_TOLERANCE = 0.02
CROSS_SPEC_MIN_AGREEMENT = float(os.environ.get("CROSS_SPEC_MIN_AGREEMENT", "0.65"))


def _dim_key(dim: Dict[str, Any]) -> str:
    dim_id = (dim.get("id") or "").strip()
    if dim_id:
        return dim_id.lower()
    applies = (dim.get("applies_to") or "").strip().lower()
    dtype = (dim.get("dimension_type") or dim.get("type") or "").lower()
    return f"{dtype}:{applies[:48]}"


def _dim_value(dim: Dict[str, Any]) -> Optional[float]:
    val = dim.get("value")
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def compare_drawing_specs(
    spec_a: Dict[str, Any],
    spec_b: Dict[str, Any],
    *,
    label_a: str = "Gemini",
    label_b: str = "GPT 5.5",
) -> Dict[str, Any]:
    dims_a = {_dim_key(d): d for d in (spec_a.get("dimensions") or []) if _dim_key(d)}
    dims_b = {_dim_key(d): d for d in (spec_b.get("dimensions") or []) if _dim_key(d)}

    matched: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    only_a: List[str] = []
    only_b: List[str] = []

    for key, da in dims_a.items():
        if key not in dims_b:
            only_a.append(key)
            continue
        db = dims_b[key]
        va, vb = _dim_value(da), _dim_value(db)
        if va is not None and vb is not None and va != 0:
            rel_err = abs(va - vb) / max(abs(va), abs(vb), 1e-9)
            if rel_err <= CROSS_SPEC_VALUE_TOLERANCE:
                matched.append({"id": key, "value_a": va, "value_b": vb})
            else:
                conflicts.append(
                    {
                        "id": key,
                        "value_a": va,
                        "value_b": vb,
                        "rel_error": round(rel_err, 4),
                    }
                )
        elif va == vb:
            matched.append({"id": key, "value_a": va, "value_b": vb})
        else:
            conflicts.append({"id": key, "value_a": va, "value_b": vb, "rel_error": None})

    for key in dims_b:
        if key not in dims_a:
            only_b.append(key)

    union = len(set(dims_a) | set(dims_b))
    agreement = len(matched) / union if union else 1.0

    return {
        "label_a": label_a,
        "label_b": label_b,
        "agreement_score": round(agreement, 4),
        "matched_count": len(matched),
        "conflict_count": len(conflicts),
        "only_a": only_a,
        "only_b": only_b,
        "conflicts": conflicts[:20],
        "matched": matched[:20],
    }


def merge_drawing_specs(
    primary: Dict[str, Any],
    secondary: Dict[str, Any],
    comparison: Dict[str, Any],
) -> Dict[str, Any]:
    """Consensus merge: prefer primary (Gemini), fill gaps from secondary, flag conflicts."""
    merged = json.loads(json.dumps(primary))
    conflict_ids = {c["id"] for c in comparison.get("conflicts") or []}
    only_b = set(comparison.get("only_b") or [])

    dims_by_key = {_dim_key(d): d for d in (merged.get("dimensions") or [])}
    for dim in secondary.get("dimensions") or []:
        key = _dim_key(dim)
        if key in only_b and key not in dims_by_key:
            dims_by_key[key] = dim
        elif key in conflict_ids:
            pa, pb = _dim_value(dims_by_key.get(key, {})), _dim_value(dim)
            if pa is not None and pb is not None:
                dims_by_key[key]["value"] = round((pa + pb) / 2.0, 6)

    merged["dimensions"] = list(dims_by_key.values())

    ambiguities = list(merged.get("ambiguities") or [])
    for conflict in comparison.get("conflicts") or []:
        ambiguities.append(
            f"Cross-model disagreement on {conflict['id']}: "
            f"{comparison.get('label_a')}={conflict.get('value_a')} vs "
            f"{comparison.get('label_b')}={conflict.get('value_b')}"
        )
    merged["ambiguities"] = ambiguities

    features_a = {f.get("id"): f for f in (primary.get("features") or []) if f.get("id")}
    for feat in secondary.get("features") or []:
        fid = feat.get("id")
        if fid and fid not in features_a:
            merged.setdefault("features", []).append(feat)

    return merged


def extract_numeric_params_from_code(code: str) -> Dict[str, float]:
    params: Dict[str, float] = {}
    for line in (code or "").splitlines():
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)", line)
        if m:
            try:
                params[m.group(1)] = float(m.group(2))
            except ValueError:
                continue
    return params


def score_code_against_spec(code: str, drawing_spec: Optional[Dict[str, Any]]) -> float:
    if not drawing_spec:
        return 0.5
    params = extract_numeric_params_from_code(code)
    dims = drawing_spec.get("dimensions") or []
    if not dims:
        return 0.5 if params else 0.0

    hits = 0
    checked = 0
    for dim in dims:
        key = dim.get("id")
        expected = _dim_value(dim)
        if not key or expected is None:
            continue
        checked += 1
        actual = params.get(key)
        if actual is None:
            continue
        rel = abs(actual - expected) / max(abs(expected), 1e-9)
        if rel <= 0.05:
            hits += 1

    if checked == 0:
        return 0.5
    return hits / checked


CODEGEN_PRIMARY_LABEL = "Gemini"


def select_best_code(
    code_primary: str,
    code_secondary: str,
    drawing_spec: Optional[Dict[str, Any]],
    review: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str, Dict[str, Any]]:
    """Return (chosen_code, source_label, metadata)."""
    score_a = score_code_against_spec(code_primary, drawing_spec)
    score_b = score_code_against_spec(code_secondary, drawing_spec)

    meta: Dict[str, Any] = {
        "gemini_score": round(score_a, 4),
        "claude_score": round(score_b, 4),
        "review": review,
    }

    review_rec = (review or {}).get("recommendation", "")
    if review_rec == "use_claude" and code_secondary.strip():
        meta["selected"] = "gpt"
        meta["reason"] = "GPT code review recommended Pioneer implementation"
        return code_secondary, "GPT 5.5", meta

    if score_b > score_a + 0.08 and code_secondary.strip():
        meta["selected"] = "pioneer"
        meta["reason"] = f"Higher spec-alignment score ({score_b:.2f} vs {score_a:.2f})"
        return code_secondary, "GPT 5.5", meta

    meta["selected"] = "gemini"
    meta["reason"] = f"Default Gemini codegen (score {score_a:.2f} vs GPT {score_b:.2f})"
    return code_primary, CODEGEN_PRIMARY_LABEL, meta


def format_spec_cross_validation_log(
    comparison: Dict[str, Any],
    merged: bool,
    review_summary: Optional[str] = None,
) -> str:
    lines = [
        "[V5 Cross-Validation] Dual-model spec comparison",
        f"  Agreement score: {comparison.get('agreement_score', 0):.1%}",
        f"  Matched dimensions: {comparison.get('matched_count', 0)}",
        f"  Conflicts: {comparison.get('conflict_count', 0)}",
        f"  Only in {comparison.get('label_a', 'A')}: {len(comparison.get('only_a') or [])}",
        f"  Only in {comparison.get('label_b', 'B')}: {len(comparison.get('only_b') or [])}",
    ]
    for conflict in (comparison.get("conflicts") or [])[:6]:
        lines.append(
            f"  · conflict {conflict.get('id')}: "
            f"{conflict.get('value_a')} vs {conflict.get('value_b')}"
        )
    if merged:
        lines.append("[V5 Cross-Validation] Merged consensus spec applied for codegen.")
    if review_summary:
        lines.append(f"[V5 Cross-Validation] GPT review: {review_summary[:400]}")
    return "\n".join(lines)


def format_code_cross_validation_log(meta: Dict[str, Any]) -> str:
    review = meta.get("review") or {}
    lines = [
        "[V5 Cross-Validation] Dual-model CadQuery selection",
        f"  Selected: {meta.get('selected', '?')} — {meta.get('reason', '')}",
        f"  Gemini spec-alignment score: {meta.get('gemini_score', 0):.2f}",
        f"  GPT spec-alignment score: {meta.get('claude_score', 0):.2f}",
    ]
    if review:
        lines.append(
            f"  GPT review approved: {review.get('approved')} "
            f"(confidence {review.get('confidence', '?')})"
        )
        for issue in (review.get("issues") or [])[:4]:
            lines.append(f"  · [{issue.get('severity')}] {issue.get('description', '')[:120]}")
    return "\n".join(lines)
