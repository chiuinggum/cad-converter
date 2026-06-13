from __future__ import annotations

from pathlib import Path

from drawing_agent.extractor import extract_drawing
from drawing_agent.repairer import repair_drawing_spec
from drawing_agent.reviewer import review_drawing_spec
from drawing_agent.schemas import (
    DrawingRefinementResult,
    DrawingSpec,
    DrawingSpecReview,
    RefinementIteration,
    ReviewSeverity,
)


def summarize_iteration(
    iteration: int,
    review: DrawingSpecReview,
) -> RefinementIteration:
    blocking_issue_count = sum(
        1
        for issue in review.issues
        if issue.severity == ReviewSeverity.BLOCKING
    )

    return RefinementIteration(
        iteration=iteration,
        review_status=review.review_status,
        can_proceed=(
            review.can_proceed
        ),
        issue_count=len(review.issues),
        blocking_issue_count=blocking_issue_count,
        summary=review.summary,
    )


def refine_drawing_spec(
    image_path: str | Path,
    *,
    initial_spec: DrawingSpec | None = None,
    model: str | None = None,
    max_iterations: int = 3,
) -> DrawingRefinementResult:
    if max_iterations < 1:
        raise ValueError(
            "max_iterations must be at least 1"
        )

    spec = initial_spec or extract_drawing(
        image_path,
        model=model,
    )
    history: list[RefinementIteration] = []
    latest_review: DrawingSpecReview | None = None

    for iteration in range(1, max_iterations + 1):
        latest_review = review_drawing_spec(
            image_path,
            spec,
            model=model,
        )
        history.append(
            summarize_iteration(
                iteration,
                latest_review,
            )
        )

        if latest_review.can_proceed:
            return DrawingRefinementResult(
                completed_iterations=iteration,
                stopped_reason=(
                    "review_approved_for_cad_planning"
                ),
                final_spec=spec,
                final_review=latest_review,
                history=history,
            )

        if iteration == max_iterations:
            break

        spec = repair_drawing_spec(
            image_path,
            spec,
            latest_review,
            model=model,
        )

    assert latest_review is not None

    return DrawingRefinementResult(
        completed_iterations=max_iterations,
        stopped_reason="max_iterations_reached",
        final_spec=spec,
        final_review=latest_review,
        history=history,
    )
