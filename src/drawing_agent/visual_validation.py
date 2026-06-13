from __future__ import annotations

from pathlib import Path

import matplotlib
import numpy as np
import trimesh
from PIL import Image

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

from drawing_agent.gemini_json import (
    create_client,
    generate_json_response,
    load_image_part,
    parse_response_as_model,
    prepare_generation,
    select_model,
)
from drawing_agent.schemas import (
    ProjectionKind,
    ViewDecoupleResult,
    ViewRegionBox,
    ViewType,
    VisualValidationResult,
)
from drawing_agent.view_decouple import (
    compose_view_panels,
    dedupe_view_types,
    default_views_fallback,
    format_view_summary,
)

VISUAL_COMPARE_SYSTEM = """
You compare a complete engineering drawing sheet (reference) with a rendered multi-view composite from a 3D CAD model (candidate).

The candidate composite shows synthetic renders for the view types detected on the reference sheet (orthographic and/or perspective/isometric).

Return JSON with:
- consistent: true only if the 3D model geometry matches the drawing (silhouette, proportions, major features)
- score: 0-1 geometric similarity confidence
- summary: concise verdict
- issues: list of {id, view_id, severity, description}
  severity is blocking | warning

Match each rendered panel against the corresponding view on the full drawing sheet.
Ignore title blocks, BOM tables, dimension text, and annotation differences.
Penalize missing/extra features, wrong proportions, mirrored geometry, or incorrect section topology.
"""


VIEW_CAMERA: dict[ViewType, tuple[str, float, float]] = {
    ViewType.FRONT: ("ortho", 0.0, -90.0),
    ViewType.TOP: ("ortho", 90.0, 0.0),
    ViewType.RIGHT: ("ortho", 0.0, 0.0),
    ViewType.LEFT: ("ortho", 0.0, 180.0),
    ViewType.REAR: ("ortho", 0.0, 90.0),
    ViewType.BOTTOM: ("ortho", -90.0, 0.0),
    ViewType.SECTION: ("ortho", 0.0, -90.0),
    ViewType.DETAIL: ("persp", 25.0, 45.0),
    ViewType.ISOMETRIC: ("persp", 35.0, 45.0),
    ViewType.UNKNOWN: ("persp", 30.0, 45.0),
}


def normalize_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    center = (mesh.bounds[0] + mesh.bounds[1]) / 2.0
    mesh.apply_translation(-center)
    extent = float(np.max(mesh.extents))
    if extent > 1e-7:
        mesh.apply_scale(1.0 / extent)
    mesh.apply_translation([0.5, 0.5, 0.5])
    return mesh


def render_mesh_panel(
    mesh: trimesh.Trimesh,
    view: ViewRegionBox,
    img_size: int = 320,
) -> Image.Image:
    mode, elev, azim = VIEW_CAMERA.get(view.view_type, ("persp", 30.0, 45.0))
    if view.projection == ProjectionKind.PERSPECTIVE:
        mode = "persp"

    fig = plt.figure(figsize=(4, 4), dpi=max(64, img_size // 4))
    ax = fig.add_subplot(111, projection="3d")
    if mode == "ortho":
        ax.set_proj_type("ortho")

    vertices = mesh.vertices
    faces = mesh.faces
    poly3d = [[vertices[idx] for idx in face] for face in faces]
    collection = Poly3DCollection(
        poly3d,
        alpha=0.92,
        edgecolor="#475569",
        linewidth=0.08,
    )
    collection.set_facecolor("#93c5fd")
    ax.add_collection3d(collection)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_zlim(0, 1)
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    plt.tight_layout(pad=0)

    from io import BytesIO

    buf = BytesIO()
    fig.savefig(
        buf,
        format="png",
        dpi=max(64, img_size // 4),
        bbox_inches="tight",
        pad_inches=0.04,
        facecolor="white",
        edgecolor="none",
    )
    buf.seek(0)
    img = Image.open(buf).convert("RGB").resize((img_size, img_size), Image.LANCZOS)
    plt.close(fig)
    return img


def views_for_render(decouple: ViewDecoupleResult) -> list[ViewRegionBox]:
    views = dedupe_view_types(decouple.views)
    if not views:
        return default_views_fallback()
    return views


def render_model_view_composite(
    mesh: trimesh.Trimesh,
    decouple: ViewDecoupleResult,
    out_dir: Path,
    *,
    panel_size: int = 320,
) -> Image.Image:
    normalized = normalize_mesh(mesh)
    views = views_for_render(decouple)

    panels: list[Image.Image] = []
    labels: list[str] = []
    render_dir = out_dir / "render_panels"
    render_dir.mkdir(parents=True, exist_ok=True)

    for view in views:
        panel = render_mesh_panel(normalized, view, img_size=panel_size)
        panels.append(panel)
        label = view.label or f"{view.view_type.value} ({view.projection.value})"
        labels.append(label)
        panel.save(render_dir / f"render_{view.id}.jpg", format="JPEG", quality=92)

    composite = compose_view_panels(panels, labels, panel_size=panel_size)
    composite.save(out_dir / "render_views_composite.jpg", format="JPEG", quality=92)
    return composite


def compose_side_by_side(left: Image.Image, right: Image.Image, gap: int = 12) -> Image.Image:
    h = max(left.height, right.height)
    w = left.width + right.width + gap
    canvas = Image.new("RGB", (w, h), "#e2e8f0")
    canvas.paste(left, (0, (h - left.height) // 2))
    canvas.paste(right, (left.width + gap, (h - right.height) // 2))
    return canvas


def compare_drawing_with_render_composite(
    reference_drawing: Path,
    render_composite: Path,
    decouple: ViewDecoupleResult,
    *,
    model: str | None = None,
) -> VisualValidationResult:
    prepare_generation()
    client = create_client()
    model_name = select_model(model)
    view_summary = format_view_summary(decouple)
    response = generate_json_response(
        client=client,
        model=model_name,
        contents=[
            "Complete reference engineering drawing (uncropped full sheet):",
            load_image_part(reference_drawing),
            "Rendered 3D model multi-view composite (synthetic panels for detected views):",
            load_image_part(render_composite),
            (
                "Detected views on the reference sheet:\n"
                f"{view_summary}\n\n"
                "Compare whether the rendered model matches the geometry shown in those views "
                "on the full drawing."
            ),
        ],
        system_instruction=VISUAL_COMPARE_SYSTEM,
        response_model=VisualValidationResult,
    )
    return parse_response_as_model(response, VisualValidationResult)


def visual_validation_should_pass(result: VisualValidationResult, min_score: float = 0.72) -> bool:
    blocking = [
        issue
        for issue in result.issues
        if (issue.severity or "").lower() == "blocking"
    ]
    return result.consistent and not blocking and result.score >= min_score
