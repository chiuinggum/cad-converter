import pytest

from drawing_agent.schemas import (
    DrawingRefinementResult,
    DrawingSpec,
    DrawingSpecReview,
    RefinementIteration,
    ReviewSeverity,
)


def test_simple_plate_drawing_spec() -> None:
    spec = DrawingSpec.model_validate(
        {
            "schema_version": "0.2.0",
            "part_name": "Mounting plate",
            "drawing_number": None,
            "default_unit": "mm",
            "projection_method": None,
            "views": [
                {
                    "id": "view_front",
                    "view_type": "front",
                    "label": None,
                    "description": "Rectangular plate view",
                    "confidence": 0.95,
                }
            ],
            "dimensions": [
                {
                    "id": "dim_001",
                    "dimension_type": "linear",
                    "value": 100.0,
                    "unit": "mm",
                    "tolerance": None,
                    "limits": None,
                    "applies_to": "Overall width of plate",
                    "evidence": {
                        "source_view_id": "view_front",
                        "source_text": "100",
                        "visual_description": (
                            "Horizontal overall dimension above the plate"
                        ),
                    },
                    "explicit": True,
                    "confidence": 0.99,
                },
                {
                    "id": "dim_002",
                    "dimension_type": "diameter",
                    "value": 12.0,
                    "unit": "mm",
                    "tolerance": None,
                    "limits": None,
                    "applies_to": "Central circular feature",
                    "evidence": {
                        "source_view_id": "view_front",
                        "source_text": "Ø12",
                        "visual_description": (
                            "Diameter annotation pointing to central circle"
                        ),
                    },
                    "explicit": True,
                    "confidence": 0.99,
                },
            ],
            "features": [
                {
                    "id": "feature_001",
                    "feature_type": "outer_profile",
                    "description": "Rectangular outer profile",
                    "dimension_ids": ["dim_001"],
                    "source_view_ids": ["view_front"],
                    "inferred": False,
                    "confidence": 0.95,
                },
                {
                    "id": "feature_002",
                    "feature_type": "hole",
                    "description": "Central circular feature",
                    "dimension_ids": ["dim_002"],
                    "source_view_ids": ["view_front"],
                    "inferred": False,
                    "confidence": 0.95,
                },
            ],
            "relations": [],
            "ambiguities": [
                {
                    "id": "ambiguity_001",
                    "description": (
                        "The drawing does not state whether the circular "
                        "feature is through or blind."
                    ),
                    "affected_entity_ids": ["feature_002"],
                    "question": "Is the central hole through or blind?",
                    "suggested_options": ["through", "blind"],
                    "severity": "blocking",
                }
            ],
            "unsupported_or_unreadable_items": [],
            "general_notes": [],
        }
    )

    assert spec.default_unit.value == "mm"
    assert spec.dimensions[1].value == 12.0
    assert len(spec.ambiguities) == 1


def test_limit_dimension_and_bilateral_tolerance() -> None:
    spec = DrawingSpec.model_validate(
        {
            "schema_version": "0.2.0",
            "part_name": "Spacer, shouldered",
            "drawing_number": "827-9999-903",
            "default_unit": "inch",
            "projection_method": "third_angle",
            "views": [
                {
                    "id": "view_section",
                    "view_type": "section",
                    "label": None,
                    "description": "Section view of the shoulder spacer",
                    "confidence": 0.97,
                }
            ],
            "dimensions": [
                {
                    "id": "dim_outer_diameter",
                    "dimension_type": "diameter",
                    "value": None,
                    "unit": "inch",
                    "tolerance": None,
                    "limits": {
                        "lower": 0.214,
                        "upper": 0.224,
                        "text": ".214 - .224",
                    },
                    "applies_to": "Outer diameter of the spacer body",
                    "evidence": {
                        "source_view_id": "view_section",
                        "source_text": "Ø.214 - .224",
                        "visual_description": (
                            "Diameter callout for the outside cylindrical body"
                        ),
                    },
                    "explicit": True,
                    "confidence": 0.97,
                },
                {
                    "id": "dim_step_offset",
                    "dimension_type": "linear",
                    "value": 0.075,
                    "unit": "inch",
                    "tolerance": {
                        "upper": 0.015,
                        "lower": -0.015,
                        "text": ".075 ± .015",
                    },
                    "limits": None,
                    "applies_to": "Offset from shoulder face to internal step",
                    "evidence": {
                        "source_view_id": "view_section",
                        "source_text": ".075 ± .015",
                        "visual_description": (
                            "Vertical dimension between shoulder face and inner step"
                        ),
                    },
                    "explicit": True,
                    "confidence": 0.94,
                },
            ],
            "features": [],
            "relations": [],
            "ambiguities": [],
            "unsupported_or_unreadable_items": [],
            "general_notes": [],
        }
    )

    assert spec.dimensions[0].value is None
    assert spec.dimensions[0].limits is not None
    assert spec.dimensions[0].limits.lower == 0.214
    assert spec.dimensions[0].limits.upper == 0.224
    assert spec.dimensions[1].value == 0.075
    assert spec.dimensions[1].tolerance is not None
    assert spec.dimensions[1].tolerance.lower == -0.015


def test_review_with_minor_issues_can_still_proceed() -> None:
    review = DrawingSpecReview.model_validate(
        {
            "schema_version": "0.1.0",
            "review_status": "needs_revision",
            "can_proceed": True,
            "summary": "Spec is usable but one relation should be refined.",
            "issues": [
                {
                    "id": "issue_001",
                    "severity": "medium",
                    "category": "relation_capture",
                    "title": "Datum relation should be more specific",
                    "description": (
                        "A datum assignment is present but attached to a "
                        "dimension instead of the feature."
                    ),
                    "affected_entity_ids": ["dim_001"],
                    "recommendation": (
                        "Attach the datum relation to the referenced "
                        "feature before CAD planning if possible."
                    ),
                    "confidence": 0.84,
                }
            ],
            "recommended_next_steps": [
                "Revise the datum relation attachment.",
            ],
        }
    )

    assert review.can_proceed is True
    assert review.issues[0].severity == ReviewSeverity.MEDIUM


def test_review_cannot_pass_with_blocking_issue() -> None:
    with pytest.raises(ValueError):
        DrawingSpecReview.model_validate(
            {
                "schema_version": "0.1.0",
                "review_status": "pass",
                "can_proceed": True,
                "summary": "Invalid test review.",
                "issues": [
                    {
                        "id": "issue_001",
                        "severity": "blocking",
                        "category": "dimension_binding",
                        "title": "Wrong overall dimension binding",
                        "description": (
                            "The overall length is attached to the wrong "
                            "faces."
                        ),
                        "affected_entity_ids": ["dim_010"],
                        "recommendation": (
                            "Move the dimension to ambiguities or retarget "
                            "it to the correct feature."
                        ),
                        "confidence": 0.92,
                    }
                ],
                "recommended_next_steps": [
                    "Fix the dimension binding.",
                ],
            }
        )


def test_blocked_review_cannot_allow_planning() -> None:
    with pytest.raises(ValueError):
        DrawingSpecReview.model_validate(
            {
                "schema_version": "0.1.0",
                "review_status": "blocked",
                "can_proceed": True,
                "summary": "Invalid blocked review.",
                "issues": [],
                "recommended_next_steps": [],
            }
        )


def test_refinement_result_schema() -> None:
    spec = DrawingSpec.model_validate(
        {
            "schema_version": "0.2.0",
            "part_name": "Plate",
            "drawing_number": None,
            "default_unit": "mm",
            "projection_method": None,
            "views": [],
            "dimensions": [],
            "features": [],
            "relations": [],
            "ambiguities": [],
            "unsupported_or_unreadable_items": [],
            "general_notes": [],
        }
    )

    review = DrawingSpecReview.model_validate(
        {
            "schema_version": "0.1.0",
            "review_status": "pass",
            "can_proceed": True,
            "summary": "Spec is ready.",
            "issues": [],
            "recommended_next_steps": [],
        }
    )

    result = DrawingRefinementResult.model_validate(
        {
            "schema_version": "0.1.0",
            "completed_iterations": 1,
            "stopped_reason": "review_approved_for_cad_planning",
            "final_spec": spec.model_dump(),
            "final_review": review.model_dump(),
            "history": [
                RefinementIteration(
                    iteration=1,
                    review_status="pass",
                    can_proceed=True,
                    issue_count=0,
                    blocking_issue_count=0,
                    summary="Spec is ready.",
                ).model_dump()
            ],
        }
    )

    assert result.completed_iterations == 1
    assert result.final_review.can_proceed is True
