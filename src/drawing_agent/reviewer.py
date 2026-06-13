from __future__ import annotations

from pathlib import Path

from google.genai import types

from drawing_agent.gemini_json import (
    create_client,
    dump_compact_json,
    generate_json_response,
    load_image_part,
    parse_response_as_model,
    prepare_generation,
    select_model,
)
from drawing_agent.prompts import REVIEW_SYSTEM_PROMPT
from drawing_agent.schemas import DrawingSpec, DrawingSpecReview


def build_review_user_prompt(
    drawing_spec: DrawingSpec,
) -> str:
    return f"""
Review the extracted DrawingSpec against the attached drawing image.

Look for:
- dimensions bound to the wrong geometry
- dimensions incorrectly marked as overall
- inner vs outer feature confusion
- missing or mis-attached datum or geometric tolerance relations
- feature groupings that would mislead CAD planning
- missing dimensions that should block planning

Return a DrawingSpecReview.

Current DrawingSpec JSON:
{dump_compact_json(drawing_spec)}
""".strip()


def review_drawing_spec(
    image_path: str | Path,
    drawing_spec: DrawingSpec,
    *,
    model: str | None = None,
) -> DrawingSpecReview:
    prepare_generation()

    path = Path(image_path)
    selected_model = select_model(model)
    image_part = load_image_part(path)
    user_prompt = build_review_user_prompt(
        drawing_spec
    )
    client = create_client()

    try:
        response = generate_json_response(
            client=client,
            model=selected_model,
            contents=[
                image_part,
                user_prompt,
            ],
            system_instruction=REVIEW_SYSTEM_PROMPT,
            response_model=DrawingSpecReview,
            media_resolution=(
                types.MediaResolution.MEDIA_RESOLUTION_HIGH
            ),
        )
    finally:
        client.close()

    return parse_response_as_model(
        response,
        DrawingSpecReview,
    )
