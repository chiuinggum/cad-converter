from __future__ import annotations

import argparse
from pathlib import Path

from drawing_agent.extractor import extract_drawing


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract structured information from a technical drawing."
    )

    parser.add_argument(
        "image",
        type=Path,
        help="Path to a PNG, JPEG, or WEBP technical drawing.",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("outputs/drawing_spec.json"),
        help="Path for the generated JSON file.",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override GEMINI_MODEL.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    drawing_spec = extract_drawing(
        args.image,
        model=args.model,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)

    args.output.write_text(
        drawing_spec.model_dump_json(indent=2),
        encoding="utf-8",
    )

    print(f"Drawing specification written to: {args.output}")
    print()
    print(
        f"Extracted {len(drawing_spec.views)} views, "
        f"{len(drawing_spec.dimensions)} dimensions, "
        f"{len(drawing_spec.features)} features, and "
        f"{len(drawing_spec.ambiguities)} ambiguities."
    )


if __name__ == "__main__":
    main()
