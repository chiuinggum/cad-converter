"""Pure-logic tests for measurement-based dimension diffing.

These exercise the honest validation path (drawing dims vs. values measured
from the built solid) without needing the CAD kernel installed.
"""

from drawing_agent.code_spec import (
    build_dimension_diff_from_measurement,
    dimension_diff_pass,
    dimension_diff_to_comparison,
    measured_values_pool,
)


def _dim(dim_id, value, dimension_type="linear", applies_to="", explicit=True):
    return {
        "id": dim_id,
        "value": value,
        "dimension_type": dimension_type,
        "applies_to": applies_to or dim_id,
        "explicit": explicit,
    }


def test_measured_values_pool_prefers_explicit_pool():
    measured = {"_x": 80.0, "_values": [80.0, 20.0, 30.0]}
    assert measured_values_pool(measured) == [80.0, 20.0, 30.0]


def test_measured_values_pool_fallback_scalars():
    measured = {"_x": 80.0, "_z": 20.0, "_volume": 1000.0}
    assert sorted(measured_values_pool(measured)) == [20.0, 80.0, 1000.0]


def test_all_dimensions_match_measurement():
    # Flange: outer Ø80, height 20, central bore Ø30.
    measured = {"_values": [80.0, 20.0, 30.0, 15.0, 40.0]}
    spec = {
        "dimensions": [
            _dim("D_outer", 80, "diameter", "outer cylinder"),
            _dim("H", 20, "linear", "height"),
            _dim("D_bore", 30, "diameter", "central bore"),
        ]
    }
    rows = build_dimension_diff_from_measurement(measured, spec)
    assert [r.id for r in rows] == ["D_outer", "H", "D_bore"]
    assert all(r.ok for r in rows)
    passed, ratio = dimension_diff_pass(rows)
    assert passed is True
    assert ratio == 1.0


def test_radius_diameter_equivalence_matches():
    # Drawing gives radius R15; solid measured a Ø30 cylinder (pool has 30).
    measured = {"_values": [30.0]}
    spec = {"dimensions": [_dim("R_bore", 15, "radius", "bore radius")]}
    rows = build_dimension_diff_from_measurement(measured, spec)
    assert rows[0].ok is True


def test_mismatch_is_flagged_with_real_measured_value():
    # Drawing wants Ø30 bore but the solid was built with Ø16 (radius confusion).
    measured = {"_values": [80.0, 20.0, 16.0]}
    spec = {"dimensions": [_dim("D_bore", 30, "diameter", "central bore")]}
    rows = build_dimension_diff_from_measurement(measured, spec)
    assert rows[0].ok is False
    comparison = dimension_diff_to_comparison(rows)
    assert comparison[0]["id"] == "D_bore"
    assert comparison[0]["target"] == 30.0
    assert comparison[0]["ok"] is False
    # The reported measured value is the closest *real* measurement, not a code literal.
    assert comparison[0]["measured"] == 16.0
    passed, _ = dimension_diff_pass(rows)
    assert passed is False


def test_implicit_dimensions_are_skipped():
    measured = {"_values": [50.0]}
    spec = {"dimensions": [_dim("inferred", 999, "linear", "guess", explicit=False)]}
    rows = build_dimension_diff_from_measurement(measured, spec)
    assert rows == []
