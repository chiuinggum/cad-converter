#!/usr/bin/env python3
"""Visualize GenCAD-Code samples: input image, CadQuery code, and 3D mesh render."""

from __future__ import annotations

import argparse
import io
import tempfile
import textwrap
import traceback
import types
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import trimesh
from datasets import load_dataset
from matplotlib.gridspec import GridSpec
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "GenCAD-Code",
        help="Local GenCAD-Code snapshot directory.",
    )
    parser.add_argument(
        "--split",
        default="validation",
        choices=("train", "validation", "test"),
        help="Dataset split to visualize.",
    )
    parser.add_argument(
        "--num-samples",
        type=int,
        default=6,
        help="Number of samples to export.",
    )
    parser.add_argument(
        "--start-index",
        type=int,
        default=0,
        help="Starting index within the split.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "outputs" / "gencad_visualizations",
        help="Directory for visualization outputs.",
    )
    parser.add_argument(
        "--subset-only",
        action="store_true",
        help="Only visualize samples where hundred_subset is True.",
    )
    return parser.parse_args()


def load_split(data_dir: Path, split: str):
    parquet_glob = str(data_dir / "data" / f"{split}-*.parquet")
    if not list(data_dir.glob(f"data/{split}-*.parquet")):
        return load_dataset("CADCODER/GenCAD-Code", split=split)
    return load_dataset("parquet", data_files={split: parquet_glob}, split=split)


def execute_cadquery(code: str) -> tuple[Any | None, str | None]:
    namespace: dict[str, Any] = {}
    try:
        exec(code, namespace)
    except Exception:
        return None, traceback.format_exc()

    for key in ("solid", "result", "part", "model", "cad"):
        if key in namespace:
            return namespace[key], None

    for value in namespace.values():
        if value is None or isinstance(value, (str, int, float, bool, type, types.ModuleType, types.FunctionType)):
            continue
        if hasattr(value, "val"):
            return value, None

    return None, "No CadQuery result object found in executed code."


def mesh_from_cadquery(result) -> trimesh.Trimesh | None:
    try:
        shape = result.val() if hasattr(result, "val") else result
        import cadquery as cq

        with tempfile.NamedTemporaryFile(suffix=".stl") as tmp:
            cq.exporters.export(shape, tmp.name, exportType="STL")
            mesh = trimesh.load_mesh(tmp.name, file_type="stl")
        if isinstance(mesh, trimesh.Scene):
            mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
        return mesh
    except Exception:
        return None


def render_mesh_ax(ax, mesh: trimesh.Trimesh) -> None:
    vertices = mesh.vertices
    faces = mesh.faces
    ax.plot_trisurf(
        vertices[:, 0],
        vertices[:, 1],
        vertices[:, 2],
        triangles=faces,
        color="#6baed6",
        edgecolor="#225ea8",
        linewidth=0.1,
        alpha=0.95,
    )
    ax.set_box_aspect([1, 1, 1])
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_zticks([])
    ax.view_init(elev=25, azim=-60)


def wrap_code(code: str, width: int = 72, max_lines: int = 28) -> str:
    lines = []
    for line in code.splitlines():
        if len(line) <= width:
            lines.append(line)
        else:
            lines.extend(textwrap.wrap(line, width=width, break_long_words=False))
    if len(lines) > max_lines:
        lines = lines[: max_lines - 1] + ["..."]
    return "\n".join(lines)


def visualize_sample(sample: dict, output_path: Path) -> dict[str, Any]:
    image = sample["image"]
    if not isinstance(image, Image.Image):
        image = Image.open(io.BytesIO(image["bytes"])) if isinstance(image, dict) else Image.fromarray(np.array(image))

    code = sample["cadquery"]
    deepcad_id = sample.get("deepcad_id", "unknown")
    token_count = sample.get("token_count", "?")

    result, exec_error = execute_cadquery(code)
    mesh = mesh_from_cadquery(result) if result is not None else None

    fig = plt.figure(figsize=(16, 8))
    gs = GridSpec(2, 2, figure=fig, height_ratios=[1.2, 1.0], width_ratios=[1.0, 1.0])

    ax_img = fig.add_subplot(gs[0, 0])
    ax_img.imshow(image)
    ax_img.set_title("Input Render", fontsize=12)
    ax_img.axis("off")

    ax_mesh = fig.add_subplot(gs[0, 1], projection="3d")
    if mesh is not None and len(mesh.vertices) > 0:
        render_mesh_ax(ax_mesh, mesh)
        ax_mesh.set_title("CadQuery Mesh (executed)", fontsize=12)
    else:
        ax_mesh.text2D(
            0.5,
            0.5,
            "Mesh render unavailable",
            transform=ax_mesh.transAxes,
            ha="center",
            va="center",
        )
        ax_mesh.set_title("CadQuery Mesh (failed)", fontsize=12)
        ax_mesh.axis("off")

    ax_code = fig.add_subplot(gs[1, :])
    ax_code.axis("off")
    status = "OK" if mesh is not None else (exec_error or "mesh export failed")
    header = f"deepcad_id: {deepcad_id} | token_count: {token_count} | exec: {status}"
    ax_code.text(
        0.01,
        0.98,
        header + "\n\n" + wrap_code(code),
        transform=ax_code.transAxes,
        va="top",
        ha="left",
        fontsize=8,
        family="monospace",
    )

    fig.suptitle("GenCAD-Code Sample", fontsize=14, y=0.98)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    return {
        "deepcad_id": deepcad_id,
        "output_path": str(output_path),
        "mesh_ok": mesh is not None,
        "exec_error": exec_error,
    }


def build_gallery_html(records: list[dict], output_dir: Path) -> Path:
    rows = []
    for record in records:
        rel_path = Path(record["output_path"]).name
        status = "mesh ok" if record["mesh_ok"] else "mesh failed"
        rows.append(
            f"<section><h2>{record['deepcad_id']} ({status})</h2>"
            f"<img src='{rel_path}' alt='{record['deepcad_id']}'/></section>"
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>GenCAD-Code Visualizations</title>
  <style>
    body {{ font-family: sans-serif; margin: 24px; background: #f7f7f7; }}
    section {{ background: white; padding: 16px; margin-bottom: 24px; border-radius: 8px; }}
    img {{ max-width: 100%; height: auto; border: 1px solid #ddd; }}
  </style>
</head>
<body>
  <h1>GenCAD-Code Visualizations</h1>
  {''.join(rows)}
</body>
</html>
"""
    gallery_path = output_dir / "index.html"
    gallery_path.write_text(html, encoding="utf-8")
    return gallery_path


def main() -> None:
    args = parse_args()
    dataset = load_split(args.data_dir, args.split)

    if args.subset_only:
        indices = [i for i, row in enumerate(dataset) if row.get("hundred_subset")]
    else:
        indices = list(range(len(dataset)))

    selected = indices[args.start_index : args.start_index + args.num_samples]
    if not selected:
        raise SystemExit("No samples matched the requested range/filter.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for rank, idx in enumerate(selected):
        sample = dataset[idx]
        output_path = args.output_dir / f"{args.split}_{idx:05d}.png"
        record = visualize_sample(sample, output_path)
        records.append(record)
        print(f"[{rank + 1}/{len(selected)}] saved {output_path}")

    gallery_path = build_gallery_html(records, args.output_dir)
    mesh_ok = sum(1 for r in records if r["mesh_ok"])
    print(f"Gallery: {gallery_path}")
    print(f"Mesh success rate: {mesh_ok}/{len(records)}")


if __name__ == "__main__":
    main()
