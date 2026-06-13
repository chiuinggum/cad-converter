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
from drawing_agent.prompts import REPAIR_SYSTEM_PROMPT
from drawing_agent.schemas import DrawingSpec, DrawingSpecReview


def build_repair_user_prompt(
    drawing_spec: DrawingSpec,
    review: DrawingSpecReview,
) -> str:
    return f"""
Revise the attached DrawingSpec using the review feedback.

Goals:
- resolve the listed review issues
- preserve correct extracted facts
- prefer ambiguities over unsupported guesses
- keep the spec useful for downstream CAD planning

Current DrawingSpec JSON:
{dump_compact_json(drawing_spec)}

DrawingSpecReview JSON:
{dump_compact_json(review)}
""".strip()


def repair_drawing_spec(
    image_path: str | Path,
    drawing_spec: DrawingSpec,
    review: DrawingSpecReview,
    *,
    model: str | None = None,
) -> DrawingSpec:
    prepare_generation()

    path = Path(image_path)
    selected_model = select_model(model)
    image_part = load_image_part(path)
    user_prompt = build_repair_user_prompt(
        drawing_spec,
        review,
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
            system_instruction=REPAIR_SYSTEM_PROMPT,
            response_model=DrawingSpec,
            media_resolution=(
                types.MediaResolution.MEDIA_RESOLUTION_HIGH
            ),
        )
    finally:
        client.close()

    return parse_response_as_model(
        response,
        DrawingSpec,
    )
