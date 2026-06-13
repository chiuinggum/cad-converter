from __future__ import annotations

import argparse
from pathlib import Path

from drawing_agent.refinement import refine_drawing_spec
from drawing_agent.schemas import DrawingSpec


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract, review, and iteratively repair a drawing "
            "specification until it is good enough for CAD planning "
            "or the iteration limit is reached."
        )
    )

    parser.add_argument(
        "image",
        type=Path,
        help="Path to the source technical drawing image.",
    )

    parser.add_argument(
        "--initial-spec",
        type=Path,
        default=None,
        help="Optional path to an existing DrawingSpec JSON file.",
    )

    parser.add_argument(
        "--output-spec",
        type=Path,
        default=Path("outputs/refined_drawing_spec.json"),
        help="Path for the final DrawingSpec JSON file.",
    )

    parser.add_argument(
        "--output-review",
        type=Path,
        default=Path("outputs/final_drawing_spec_review.json"),
        help="Path for the final DrawingSpecReview JSON file.",
    )

    parser.add_argument(
        "--output-report",
        type=Path,
        default=Path("outputs/drawing_refinement_report.json"),
        help="Path for the refinement report JSON file.",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override GEMINI_MODEL.",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=3,
        help="Maximum review/repair cycles to run.",
    )

    return parser.parse_args()


def load_initial_spec(
    path: Path | None,
) -> DrawingSpec | None:
    if path is None:
        return None

    if not path.exists():
        raise FileNotFoundError(
            f"Initial spec JSON does not exist: {path}"
        )

    return DrawingSpec.model_validate_json(
        path.read_text(encoding="utf-8")
    )


def write_json(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    args = parse_args()
    initial_spec = load_initial_spec(args.initial_spec)
    result = refine_drawing_spec(
        args.image,
        initial_spec=initial_spec,
        model=args.model,
        max_iterations=args.max_iterations,
    )

    write_json(
        args.output_spec,
        result.final_spec.model_dump_json(indent=2),
    )
    write_json(
        args.output_review,
        result.final_review.model_dump_json(indent=2),
    )
    write_json(
        args.output_report,
        result.model_dump_json(indent=2),
    )

    print(f"Final DrawingSpec written to: {args.output_spec}")
    print(f"Final review written to: {args.output_review}")
    print(f"Refinement report written to: {args.output_report}")
    print()
    print(
        f"Stopped after {result.completed_iterations} iteration(s): "
        f"{result.stopped_reason}. "
        f"Proceed to generate CAD: "
        f"{result.final_review.can_proceed}"
    )


if __name__ == "__main__":
    main()
