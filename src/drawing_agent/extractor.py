from __future__ import annotations

from pathlib import Path
from google.genai import types

from drawing_agent.gemini_json import (
    create_client,
    generate_json_response,
    load_image_part,
    parse_response_as_model,
    prepare_generation,
    select_model,
)
from drawing_agent.prompts import SYSTEM_PROMPT, USER_PROMPT
from drawing_agent.schemas import DrawingSpec


def extract_drawing(
    image_path: str | Path,
    *,
    model: str | None = None,
) -> DrawingSpec:
    prepare_generation()

    path = Path(image_path)
    selected_model = select_model(model)

    image_part = load_image_part(path)
    client = create_client()

    try:
        response = generate_json_response(
            client=client,
            model=selected_model,
            contents=[
                image_part,
                USER_PROMPT,
            ],
            system_instruction=SYSTEM_PROMPT,
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
