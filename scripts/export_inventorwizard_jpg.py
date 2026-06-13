#!/usr/bin/env python3
"""Download InventorWizard Drawings and export sample images as JPG."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from datasets import load_dataset


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip()).strip("_").lower()
    return slug[:max_len] or "sample"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "InventorWizard-Drawings",
        help="Directory for dataset snapshot and exported JPG files.",
    )
    parser.add_argument(
        "--jpg-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "outputs" / "inventorwizard_samples",
        help="Directory for exported JPG previews.",
    )
    parser.add_argument(
        "--num-samples",
        type=int,
        default=8,
        help="Number of drawings to export as JPG.",
    )
    parser.add_argument(
        "--repo-id",
        default="MecAgent/inventorwizard-drawings",
        help="Hugging Face dataset repository id.",
    )
    return parser.parse_args()


def pick_indices(dataset, num_samples: int) -> list[int]:
    if num_samples >= len(dataset):
        return list(range(len(dataset)))

    seen_collections: set[str] = set()
    selected: list[int] = []
    for idx, row in enumerate(dataset):
        collection = row.get("collection") or "unknown"
        if collection in seen_collections:
            continue
        seen_collections.add(collection)
        selected.append(idx)
        if len(selected) >= num_samples:
            return selected

    for idx in range(len(dataset)):
        if idx not in selected:
            selected.append(idx)
        if len(selected) >= num_samples:
            break
    return selected


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.jpg_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(args.repo_id, split="train")
    dataset.save_to_disk(str(args.output_dir / "hf_dataset"))

    indices = pick_indices(dataset, args.num_samples)
    for rank, idx in enumerate(indices):
        row = dataset[idx]
        image = row["drawing"]
        if image.mode != "RGB":
            image = image.convert("RGB")

        challenge_id = row.get("challenge_id") or f"idx_{idx:04d}"
        collection = row.get("collection") or "unknown"
        title = row.get("title") or challenge_id
        filename = f"{challenge_id}_{slugify(collection)}.jpg"
        out_path = args.jpg_dir / filename
        image.save(out_path, format="JPEG", quality=92)

        print(f"[{rank + 1}/{len(indices)}] {out_path.name}")
        print(f"  title: {title}")
        print(f"  collection: {collection}")

    print(f"Dataset saved to: {args.output_dir / 'hf_dataset'}")
    print(f"JPG samples saved to: {args.jpg_dir}")


if __name__ == "__main__":
    main()
