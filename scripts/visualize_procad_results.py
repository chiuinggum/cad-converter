#!/usr/bin/env python3
"""Visualize Pro-CAD clarification pipeline results."""

from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path
from typing import Any, Optional

import matplotlib.pyplot as plt
import numpy as np
import trimesh
from matplotlib.gridspec import GridSpec

# Run from Pro-CAD root so src imports work
PROCAD_ROOT = Path(__file__).resolve().parents[1] / "src" / "Pro-CAD"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--results",
        type=Path,
        default=PROCAD_ROOT / "clarification_results_gemini" / "all_results_parallel_0_2.json",
        help="Path to all_results_parallel_*.json",
    )
    parser.add_argument(
        "--gt-mesh-dir",
        type=Path,
        default=PROCAD_ROOT / "data" / "text2cad" / "deepcad_mesh",
        help="Directory with {uid}.stl ground-truth meshes.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "outputs" / "procad_visualizations",
        help="Output directory for PNG gallery.",
    )
    return parser.parse_args()


def load_mesh_stl(path: Path) -> Optional[trimesh.Trimesh]:
    if not path.exists():
        return None
    mesh = trimesh.load(str(path))
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
    return mesh


def mesh_from_code(code: str) -> Optional[trimesh.Trimesh]:
    if not code:
        return None
    try:
        import sys
        if str(PROCAD_ROOT) not in sys.path:
            sys.path.insert(0, str(PROCAD_ROOT))
        from src.mesh_utils import cadquery_to_mesh
        return cadquery_to_mesh(code)
    except Exception:
        return None


def render_mesh_ax(ax, mesh: trimesh.Trimesh, title: str, color: str = "#6baed6") -> None:
    vertices = mesh.vertices
    faces = mesh.faces
    ax.plot_trisurf(
        vertices[:, 0],
        vertices[:, 1],
        vertices[:, 2],
        triangles=faces,
        color=color,
        edgecolor="#333333",
        linewidth=0.05,
        alpha=0.92,
    )
    ax.set_title(title, fontsize=10)
    ax.set_box_aspect([1, 1, 1])
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_zticks([])
    ax.view_init(elev=22, azim=-55)


def cd_value(ev: Optional[dict]) -> Optional[float]:
    if not ev:
        return None
    return ev.get("chamfer_distance")


def format_cd(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    return f"{v:.6f}"


def wrap_text(text: str, width: int = 88, max_lines: int = 12) -> str:
    if not text:
        return ""
    lines: list[str] = []
    for line in text.splitlines():
        lines.extend(textwrap.wrap(line, width=width) if len(line) > width else [line])
    if len(lines) > max_lines:
        lines = lines[: max_lines - 1] + ["..."]
    return "\n".join(lines)


def plot_cd_bars(ax, labels: list[str], values: list[Optional[float]], colors: list[str]) -> None:
    xs = np.arange(len(labels))
    heights = [v if v is not None else 0.0 for v in values]
    bars = ax.bar(xs, heights, color=colors, edgecolor="#333", linewidth=0.5)
    ax.set_xticks(xs)
    ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylabel("Chamfer Distance")
    ax.set_title("CD vs Ground Truth (lower is better)", fontsize=10)
    ymax = max(heights) * 1.25 if heights and max(heights) > 0 else 0.02
    ax.set_ylim(0, ymax)
    for bar, v in zip(bars, values):
        if v is not None:
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + ymax * 0.02,
                f"{v:.4f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )


def visualize_sample(
    result: dict,
    gt_mesh_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    uid = result["uid"]
    config_name = result.get("config_name", "")
    skipped = result.get("skipped", False)

    gt_mesh = load_mesh_stl(gt_mesh_dir / f"{uid}.stl")
    clarified_code = result.get("step4_code_extracted")
    clarified_mesh = mesh_from_code(clarified_code)

    cd_orig = cd_value(result.get("evaluation_original"))
    cd_mis = cd_value(result.get("evaluation_misleading"))
    cd_clar = cd_value(result.get("evaluation"))

    fig = plt.figure(figsize=(16, 10))
    gs = GridSpec(2, 3, figure=fig, height_ratios=[1.2, 1.0], hspace=0.35, wspace=0.25)

    mesh_specs = [
        (gs[0, 0], gt_mesh, "Ground Truth (STL)", "#4daf4a"),
        (gs[0, 1], clarified_mesh, "Clarified (generated)", "#377eb8"),
    ]
    for spec, mesh, title, color in mesh_specs:
        ax = fig.add_subplot(spec, projection="3d")
        if mesh is not None and len(mesh.vertices) > 0:
            render_mesh_ax(ax, mesh, title, color=color)
        else:
            ax.text2D(0.5, 0.5, "Mesh unavailable", transform=ax.transAxes, ha="center", va="center")
            ax.set_title(title, fontsize=10)
            ax.axis("off")

    ax_cd = fig.add_subplot(gs[0, 2])
    labels = ["Original", "Misleading", "Clarified"]
    values = [cd_orig, cd_mis, cd_clar]
    colors = ["#66c2a5", "#fc8d62", "#8da0cb"]
    plot_cd_bars(ax_cd, labels, values, colors)

    ax_text = fig.add_subplot(gs[1, :])
    ax_text.axis("off")

    step1 = result.get("step1_analysis") or {}
    questions = step1.get("questions") or []
    q_text = "\n".join(f"  - {q}" for q in questions) if questions else "  (none)"
    status = "SKIPPED" if skipped else ("CLARIFIED" if clarified_code else "NO CODE")
    header = (
        f"uid: {uid} | config: {config_name} | status: {status}\n"
        f"is_misleading: {step1.get('is_misleading')} | skip: {result.get('skip_reason') or '—'}\n"
        f"CD — original: {format_cd(cd_orig)} | misleading: {format_cd(cd_mis)} | clarified: {format_cd(cd_clar)}\n"
    )
    body_parts = [
        "What changed:\n" + wrap_text(result.get("what_changed") or "", max_lines=4),
        "Clarifier questions:\n" + q_text,
        "Gemini answers:\n" + wrap_text(result.get("step2_answers") or "—", max_lines=4),
    ]
    if clarified_code:
        body_parts.append("Generated code:\n" + wrap_text(clarified_code, width=100, max_lines=6))

    ax_text.text(
        0.01,
        0.98,
        header + "\n" + "\n\n".join(body_parts),
        transform=ax_text.transAxes,
        va="top",
        ha="left",
        fontsize=8,
        family="monospace",
    )

    fig.suptitle(f"Pro-CAD Pipeline — {uid}", fontsize=14, y=0.98)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    return {
        "uid": uid,
        "output_path": str(output_path),
        "gt_ok": gt_mesh is not None,
        "clarified_ok": clarified_mesh is not None,
        "cd_orig": cd_orig,
        "cd_mis": cd_mis,
        "cd_clar": cd_clar,
    }


def plot_summary(stats: dict, records: list[dict], output_path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    agg_labels = ["Original", "Misleading", "Clarified"]
    agg_vals = [
        np.mean(stats.get("cds_original") or [0]),
        np.mean(stats.get("cds_misleading") or [0]),
        np.mean(stats.get("cds_clarified") or [0]),
    ]
    plot_cd_bars(axes[0], agg_labels, agg_vals, ["#66c2a5", "#fc8d62", "#8da0cb"])
    axes[0].set_title("Mean Chamfer Distance (all samples)")

    uids = [r["uid"] for r in records]
    x = np.arange(len(uids))
    w = 0.25
    axes[1].bar(x - w, [r["cd_orig"] or 0 for r in records], w, label="Original", color="#66c2a5")
    axes[1].bar(x, [r["cd_mis"] or 0 for r in records], w, label="Misleading", color="#fc8d62")
    axes[1].bar(x + w, [r["cd_clar"] or 0 for r in records], w, label="Clarified", color="#8da0cb")
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(uids, rotation=15, ha="right")
    axes[1].set_ylabel("Chamfer Distance")
    axes[1].set_title("Per-sample CD")
    axes[1].legend(fontsize=8)

    fig.suptitle("Pro-CAD Results Summary", fontsize=13)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def build_gallery_html(records: list[dict], output_dir: Path, meta: dict) -> Path:
    models = meta.get("models", {})
    rows = []
    for r in records:
        name = Path(r["output_path"]).name
        rows.append(
            f"<section><h2>{r['uid']}</h2>"
            f"<p>CD: orig={format_cd(r.get('cd_orig'))} | "
            f"mis={format_cd(r.get('cd_mis'))} | clar={format_cd(r.get('cd_clar'))}</p>"
            f"<img src='{name}' alt='{r['uid']}'/></section>"
        )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Pro-CAD Visualizations</title>
  <style>
    body {{ font-family: sans-serif; margin: 24px; background: #f5f5f5; }}
    h1 {{ margin-bottom: 8px; }}
    .meta {{ color: #555; margin-bottom: 24px; }}
    section {{ background: white; padding: 16px; margin-bottom: 24px; border-radius: 8px; }}
    img {{ max-width: 100%; border: 1px solid #ddd; }}
    .summary {{ margin-bottom: 24px; }}
  </style>
</head>
<body>
  <h1>Pro-CAD Clarification Results</h1>
  <p class="meta">
    Clarifier: {models.get('clarify_agent', '—')}<br/>
    Answer: {models.get('answer_model', '—')}<br/>
    Coder: {models.get('code_gen_model', '—')}
  </p>
  <section class="summary">
    <h2>Summary</h2>
    <img src="summary.png" alt="summary"/>
  </section>
  {''.join(rows)}
</body>
</html>"""
    gallery = output_dir / "index.html"
    gallery.write_text(html, encoding="utf-8")
    return gallery


def main() -> None:
    args = parse_args()
    data = json.loads(args.results.read_text(encoding="utf-8"))
    results = data.get("results", [])
    stats = data.get("stats", {})
    meta = data.get("metadata", {})

    args.output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for result in results:
        out = args.output_dir / f"{result['uid']}_{result.get('config_name', 'sample')}.png"
        record = visualize_sample(result, args.gt_mesh_dir, out)
        records.append(record)
        print(f"saved {out}")

    summary_path = args.output_dir / "summary.png"
    plot_summary(stats, records, summary_path)
    print(f"saved {summary_path}")

    gallery = build_gallery_html(records, args.output_dir, meta)
    print(f"gallery: {gallery}")


if __name__ == "__main__":
    main()
