from __future__ import annotations

import argparse
from pathlib import Path

from drawing_agent.reviewer import review_drawing_spec
from drawing_agent.schemas import DrawingSpec


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Review an extracted drawing specification "
            "against the source image."
        )
    )

    parser.add_argument(
        "image",
        type=Path,
        help="Path to the source technical drawing image.",
    )

    parser.add_argument(
        "spec",
        type=Path,
        help="Path to a DrawingSpec JSON file.",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("outputs/drawing_spec_review.json"),
        help="Path for the generated review JSON file.",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override GEMINI_MODEL.",
    )

    return parser.parse_args()


def load_drawing_spec(path: Path) -> DrawingSpec:
    if not path.exists():
        raise FileNotFoundError(
            f"Spec JSON does not exist: {path}"
        )

    return DrawingSpec.model_validate_json(
        path.read_text(encoding="utf-8")
    )


def main() -> None:
    args = parse_args()
    drawing_spec = load_drawing_spec(args.spec)
    review = review_drawing_spec(
        args.image,
        drawing_spec,
        model=args.model,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        review.model_dump_json(indent=2),
        encoding="utf-8",
    )

    print(f"Drawing spec review written to: {args.output}")
    print()
    print(
        f"Review status: {review.review_status.value}. "
        f"{len(review.issues)} issues found. "
        f"Proceed to generate CAD: "
        f"{review.can_proceed}"
    )


if __name__ == "__main__":
    main()
