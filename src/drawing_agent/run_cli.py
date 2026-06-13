from __future__ import annotations

import argparse
from pathlib import Path

from drawing_agent.refinement import refine_drawing_spec
from drawing_agent.schemas import DrawingSpec


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the full drawing agent pipeline: extract, "
            "review, iteratively repair, and write separated "
            "final and intermediate outputs."
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
        "--output-root",
        type=Path,
        default=Path("outputs/agent_run"),
        help=(
            "Root directory for this run. Final outputs go to "
            "'final/' and process artifacts go to 'intermediate/'."
        ),
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
        default=5,
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

    final_dir = args.output_root / "final"
    intermediate_dir = args.output_root / "intermediate"

    final_spec_path = final_dir / "drawing_spec.json"
    final_review_path = (
        final_dir / "drawing_spec_review.json"
    )
    refinement_report_path = (
        intermediate_dir / "refinement_report.json"
    )

    write_json(
        final_spec_path,
        result.final_spec.model_dump_json(indent=2),
    )
    write_json(
        final_review_path,
        result.final_review.model_dump_json(indent=2),
    )
    write_json(
        refinement_report_path,
        result.model_dump_json(indent=2),
    )

    if args.initial_spec is not None:
        copied_initial_spec_path = (
            intermediate_dir / "initial_spec.json"
        )
        write_json(
            copied_initial_spec_path,
            initial_spec.model_dump_json(indent=2),
        )

    print(f"Final DrawingSpec: {final_spec_path}")
    print(f"Final review: {final_review_path}")
    print(
        f"Intermediate refinement report: "
        f"{refinement_report_path}"
    )
    print()
    print(
        f"Stopped after {result.completed_iterations} "
        f"iteration(s): {result.stopped_reason}. "
        f"Proceed to generate CAD: "
        f"{result.final_review.can_proceed}"
    )


if __name__ == "__main__":
    main()
