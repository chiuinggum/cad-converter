from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

from drawing_agent.gemini_json import (
    create_client,
    generate_json_response,
    load_image_part,
    parse_response_as_model,
    prepare_generation,
    select_model,
)
from drawing_agent.schemas import ProjectionKind, ViewDecoupleResult, ViewRegionBox, ViewType

VIEW_IDENTIFY_SYSTEM = """
You analyze mechanical/engineering drawing sheets and identify which standard view types are present.

For every distinct view type on the sheet return one entry:
- id: unique short id (v1, v2, ...)
- view_type: front | top | right | left | rear | bottom | section | detail | isometric | unknown
- projection: orthographic for true projection views; perspective for isometric/3D/perspective renders
- label: visible view label if any (e.g. "SECTION A-A", "DETAIL B"), else null
- confidence: 0-1

Rules:
1. List view types only — do NOT return bounding boxes or crop coordinates.
2. Include geometry views (front/top/right/section/isometric etc.), not title block or BOM tables.
3. If the same view type appears multiple times (e.g. two sections), list each separately with distinct ids.
4. Prefer orthographic views first conceptually, then perspective/isometric.
5. If unsure, include the view with lower confidence rather than omitting it.
"""


ORTHO_VIEW_ORDER = {
    ViewType.FRONT: 0,
    ViewType.TOP: 1,
    ViewType.RIGHT: 2,
    ViewType.LEFT: 3,
    ViewType.REAR: 4,
    ViewType.BOTTOM: 5,
    ViewType.SECTION: 6,
    ViewType.DETAIL: 7,
    ViewType.ISOMETRIC: 8,
    ViewType.UNKNOWN: 9,
}


def decouple_drawing_views(
    image_path: Path,
    *,
    model: str | None = None,
) -> ViewDecoupleResult:
    prepare_generation()
    client = create_client()
    model_name = select_model(model)
    image_part = load_image_part(image_path)
    response = generate_json_response(
        client=client,
        model=model_name,
        contents=[
            image_part,
            (
                "Identify all orthographic and perspective/isometric view types present "
                "on this engineering drawing sheet. Do not crop — only classify views."
            ),
        ],
        system_instruction=VIEW_IDENTIFY_SYSTEM,
        response_model=ViewDecoupleResult,
    )
    return parse_response_as_model(response, ViewDecoupleResult)


def sort_view_regions(views: Iterable[ViewRegionBox]) -> list[ViewRegionBox]:
    def sort_key(view: ViewRegionBox) -> tuple:
        projection_rank = 0 if view.projection == ProjectionKind.ORTHOGRAPHIC else 1
        type_rank = ORTHO_VIEW_ORDER.get(view.view_type, 99)
        return (projection_rank, type_rank, view.id)

    return sorted(list(views), key=sort_key)


def dedupe_view_types(views: Iterable[ViewRegionBox]) -> list[ViewRegionBox]:
    """Keep one entry per view_type (highest confidence) for rendering."""
    best: dict[ViewType, ViewRegionBox] = {}
    for view in views:
        existing = best.get(view.view_type)
        if existing is None or view.confidence > existing.confidence:
            best[view.view_type] = view
    return sort_view_regions(best.values())


def format_view_summary(decouple: ViewDecoupleResult) -> str:
    lines = []
    for view in sort_view_regions(decouple.views):
        label = view.label or view.view_type.value
        lines.append(
            f"- {view.id}: {label} ({view.view_type.value}, {view.projection.value})"
        )
    return "\n".join(lines) if lines else "- none detected"


def compose_view_panels(
    panels: list[Image.Image],
    labels: list[str],
    panel_size: int = 320,
    border: int = 8,
    label_height: int = 28,
) -> Image.Image:
    if not panels:
        raise ValueError("compose_view_panels requires at least one panel")

    count = len(panels)
    cols = 1 if count == 1 else (2 if count <= 4 else 3)
    rows = math.ceil(count / cols)
    cell_w = panel_size + border * 2
    cell_h = panel_size + label_height + border * 2
    grid = Image.new("RGB", (cols * cell_w, rows * cell_h), "#f4f4f5")
    draw = ImageDraw.Draw(grid)
    font = ImageFont.load_default()

    for idx, (panel, label) in enumerate(zip(panels, labels)):
        row, col = divmod(idx, cols)
        x = col * cell_w + border
        y = row * cell_h + border
        fitted = _fit_panel(panel, panel_size)
        grid.paste(fitted, (x, y))
        draw.rectangle(
            [x - 1, y - 1, x + panel_size, y + panel_size],
            outline="#cbd5e1",
            width=1,
        )
        draw.text((x, y + panel_size + 4), label[:40], fill="#334155", font=font)

    return grid


def _fit_panel(panel: Image.Image, size: int) -> Image.Image:
    panel = panel.convert("RGB")
    panel.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), "white")
    ox = (size - panel.width) // 2
    oy = (size - panel.height) // 2
    canvas.paste(panel, (ox, oy))
    return canvas


def default_views_fallback() -> list[ViewRegionBox]:
    return [
        ViewRegionBox(
            id="v1",
            view_type=ViewType.FRONT,
            projection=ProjectionKind.ORTHOGRAPHIC,
            label="front",
            confidence=0.5,
        ),
        ViewRegionBox(
            id="v2",
            view_type=ViewType.TOP,
            projection=ProjectionKind.ORTHOGRAPHIC,
            label="top",
            confidence=0.5,
        ),
        ViewRegionBox(
            id="v3",
            view_type=ViewType.RIGHT,
            projection=ProjectionKind.ORTHOGRAPHIC,
            label="right",
            confidence=0.5,
        ),
        ViewRegionBox(
            id="v4",
            view_type=ViewType.ISOMETRIC,
            projection=ProjectionKind.PERSPECTIVE,
            label="isometric",
            confidence=0.5,
        ),
    ]
