from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Unit(str, Enum):
    MILLIMETER = "mm"
    INCH = "inch"
    DEGREE = "degree"
    UNITLESS = "unitless"
    UNKNOWN = "unknown"


class ViewType(str, Enum):
    FRONT = "front"
    TOP = "top"
    RIGHT = "right"
    LEFT = "left"
    REAR = "rear"
    BOTTOM = "bottom"
    SECTION = "section"
    DETAIL = "detail"
    ISOMETRIC = "isometric"
    UNKNOWN = "unknown"


class DimensionType(str, Enum):
    LINEAR = "linear"
    DIAMETER = "diameter"
    RADIUS = "radius"
    ANGLE = "angle"
    DEPTH = "depth"
    COUNT = "count"
    THREAD = "thread"
    SURFACE_FINISH = "surface_finish"
    UNKNOWN = "unknown"


class FeatureType(str, Enum):
    OUTER_PROFILE = "outer_profile"
    HOLE = "hole"
    POCKET = "pocket"
    SLOT = "slot"
    STEP = "step"
    BOSS = "boss"
    FILLET = "fillet"
    CHAMFER = "chamfer"
    THREAD = "thread"
    PATTERN = "pattern"
    UNKNOWN = "unknown"


class Tolerance(StrictModel):
    upper: float | None
    lower: float | None
    text: str | None


class LimitValues(StrictModel):
    lower: float | None = None
    upper: float | None = None
    text: str | None = None

    @model_validator(mode="after")
    def validate_limits(self) -> "LimitValues":
        if self.lower is None and self.upper is None:
            raise ValueError(
                "LimitValues must include lower, upper, or both"
            )

        if (
            self.lower is not None
            and self.upper is not None
            and self.lower > self.upper
        ):
            raise ValueError(
                "LimitValues.lower cannot be greater than upper"
            )

        return self


class Evidence(StrictModel):
    source_view_id: str | None
    source_text: str | None
    visual_description: str

    # Example:
    # source_text = "Ø12 THRU"
    # visual_description = "Diameter label attached to central circular feature"


class DrawingView(StrictModel):
    id: str
    view_type: ViewType
    label: str | None
    description: str
    confidence: float = Field(ge=0.0, le=1.0)


class DrawingDimension(StrictModel):
    id: str
    dimension_type: DimensionType

    # Visible nominal/basic value when the drawing shows one number.
    # Null is valid for limit dimensions such as ".214 - .224".
    value: float | None
    unit: Unit

    # Tolerance deltas relative to value, e.g. value=.075 with
    # tolerance.upper=.015 and tolerance.lower=-.015.
    tolerance: Tolerance | None

    # Explicit lower/upper limit values when the drawing uses a limit
    # dimension or MAX/MIN notation.
    limits: LimitValues | None = None

    # Human-readable description of what this dimension controls.
    applies_to: str

    evidence: Evidence
    explicit: bool
    confidence: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_dimension_values(self) -> "DrawingDimension":
        has_nominal_value = self.value is not None
        has_limits = self.limits is not None
        has_tolerance = self.tolerance is not None

        if not any((has_nominal_value, has_limits, has_tolerance)):
            raise ValueError(
                "DrawingDimension requires a value, limits, or tolerance"
            )

        if has_tolerance and not has_nominal_value:
            raise ValueError(
                "DrawingDimension.tolerance requires value to be set"
            )

        return self


class DrawingFeature(StrictModel):
    id: str
    feature_type: FeatureType
    description: str

    # References into DrawingDimension.id.
    dimension_ids: list[str]

    # References into DrawingView.id.
    source_view_ids: list[str]

    inferred: bool
    confidence: float = Field(ge=0.0, le=1.0)


class GeometricRelation(StrictModel):
    id: str

    # Examples: concentric, symmetric, aligned, repeated, tangent.
    relation_type: str

    # Feature IDs or semantic entity names.
    entity_ids: list[str]

    description: str
    explicit: bool
    confidence: float = Field(ge=0.0, le=1.0)


class DrawingAmbiguity(StrictModel):
    id: str
    description: str
    affected_entity_ids: list[str]
    question: str
    suggested_options: list[str]
    severity: str


class DrawingSpec(StrictModel):
    schema_version: str = "0.2.0"

    part_name: str | None
    drawing_number: str | None
    default_unit: Unit

    projection_method: str | None

    views: list[DrawingView]
    dimensions: list[DrawingDimension]
    features: list[DrawingFeature]
    relations: list[GeometricRelation]
    ambiguities: list[DrawingAmbiguity]

    unsupported_or_unreadable_items: list[str]
    general_notes: list[str]

    @model_validator(mode="after")
    def validate_references(self) -> "DrawingSpec":
        view_ids = [view.id for view in self.views]
        dimension_ids = [dimension.id for dimension in self.dimensions]
        feature_ids = [feature.id for feature in self.features]

        self._ensure_unique("view", view_ids)
        self._ensure_unique("dimension", dimension_ids)
        self._ensure_unique("feature", feature_ids)

        known_view_ids = set(view_ids)
        known_dimension_ids = set(dimension_ids)

        for feature in self.features:
            missing_views = set(feature.source_view_ids) - known_view_ids
            if missing_views:
                raise ValueError(
                    f"Feature {feature.id} references missing views: "
                    f"{sorted(missing_views)}"
                )

            missing_dimensions = (
                set(feature.dimension_ids) - known_dimension_ids
            )
            if missing_dimensions:
                raise ValueError(
                    f"Feature {feature.id} references missing dimensions: "
                    f"{sorted(missing_dimensions)}"
                )

        return self

    @staticmethod
    def _ensure_unique(entity_name: str, ids: list[str]) -> None:
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate {entity_name} IDs found")


class ReviewStatus(str, Enum):
    PASS = "pass"
    NEEDS_REVISION = "needs_revision"
    BLOCKED = "blocked"


class ReviewSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCKING = "blocking"


class ReviewIssue(StrictModel):
    id: str
    severity: ReviewSeverity
    category: str
    title: str
    description: str
    affected_entity_ids: list[str]
    recommendation: str
    confidence: float = Field(ge=0.0, le=1.0)


class DrawingSpecReview(StrictModel):
    schema_version: str = "0.1.0"
    review_status: ReviewStatus
    can_proceed: bool
    summary: str
    issues: list[ReviewIssue]
    recommended_next_steps: list[str]

    @model_validator(mode="after")
    def validate_review_status(self) -> "DrawingSpecReview":
        has_blocking_issue = any(
            issue.severity == ReviewSeverity.BLOCKING
            for issue in self.issues
        )

        if has_blocking_issue and self.review_status == ReviewStatus.PASS:
            raise ValueError(
                "Review cannot pass when blocking issues exist"
            )

        if self.review_status == ReviewStatus.PASS:
            if not self.can_proceed:
                raise ValueError(
                    "Passing review must allow CAD planning"
                )
        elif self.review_status == ReviewStatus.BLOCKED:
            if self.can_proceed:
                raise ValueError(
                    "Blocked review cannot allow CAD planning"
                )

        return self


class RefinementIteration(StrictModel):
    iteration: int
    review_status: ReviewStatus
    can_proceed: bool
    issue_count: int = Field(ge=0)
    blocking_issue_count: int = Field(ge=0)
    summary: str


class DrawingRefinementResult(StrictModel):
    schema_version: str = "0.1.0"
    completed_iterations: int = Field(ge=1)
    stopped_reason: str
    final_spec: DrawingSpec
    final_review: DrawingSpecReview
    history: list[RefinementIteration]


class CodeSpecDimension(StrictModel):
    id: str
    dimension_type: str
    value: float | None
    unit: str
    applies_to: str


class CodeSpecFeature(StrictModel):
    id: str
    feature_type: str
    description: str


class CodeDerivedSpec(StrictModel):
    schema_version: str = "0.1.0"
    default_unit: str
    dimensions: list[CodeSpecDimension]
    features: list[CodeSpecFeature]
    general_notes: list[str]


class SpecMismatch(StrictModel):
    id: str
    category: str
    description: str
    drawing_value: str | None
    code_value: str | None
    severity: str


class SpecValidationResult(StrictModel):
    schema_version: str = "0.1.0"
    consistent: bool
    summary: str
    mismatches: list[SpecMismatch]


class ProjectionKind(str, Enum):
    ORTHOGRAPHIC = "orthographic"
    PERSPECTIVE = "perspective"


class ViewRegionBox(StrictModel):
    id: str
    view_type: ViewType
    projection: ProjectionKind
    label: str | None
    confidence: float = Field(ge=0.0, le=1.0)


class ViewDecoupleResult(StrictModel):
    schema_version: str = "0.1.0"
    views: list[ViewRegionBox]
    layout_description: str
    notes: list[str]


class VisualComparisonIssue(StrictModel):
    id: str
    view_id: str | None
    severity: str
    description: str


class VisualValidationResult(StrictModel):
    schema_version: str = "0.1.0"
    consistent: bool
    score: float = Field(ge=0.0, le=1.0)
    summary: str
    issues: list[VisualComparisonIssue]
