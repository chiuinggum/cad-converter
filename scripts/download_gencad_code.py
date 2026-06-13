#!/usr/bin/env python3
"""Download CADCODER/GenCAD-Code dataset from Hugging Face."""

from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "GenCAD-Code",
        help="Local directory for the dataset snapshot.",
    )
    parser.add_argument(
        "--repo-id",
        default="CADCODER/GenCAD-Code",
        help="Hugging Face dataset repository id.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    local_dir = snapshot_download(
        repo_id=args.repo_id,
        repo_type="dataset",
        local_dir=str(args.output_dir),
        local_dir_use_symlinks=False,
    )
    print(f"Dataset downloaded to: {local_dir}")


if __name__ == "__main__":
    main()
