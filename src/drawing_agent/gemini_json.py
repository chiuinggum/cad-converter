from __future__ import annotations

import mimetypes
import os
import time
from pathlib import Path
from typing import Any, TypeVar

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError


SUPPORTED_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}


ModelT = TypeVar("ModelT", bound=BaseModel)


def load_image_part(image_path: Path) -> types.Part:
    if not image_path.exists():
        raise FileNotFoundError(
            f"Image does not exist: {image_path}"
        )

    if not image_path.is_file():
        raise ValueError(
            f"Path is not a file: {image_path}"
        )

    suffix = image_path.suffix.lower()

    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError(
            f"Unsupported image type: {suffix}. "
            f"Supported types: {sorted(SUPPORTED_SUFFIXES)}"
        )

    mime_type, _ = mimetypes.guess_type(image_path.name)

    if mime_type is None or not mime_type.startswith("image/"):
        raise ValueError(
            f"Could not determine image MIME type: {image_path}"
        )

    return types.Part.from_bytes(
        data=image_path.read_bytes(),
        mime_type=mime_type,
    )


def validate_google_configuration() -> None:
    using_vertex_ai = (
        os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower()
        == "true"
    )

    if using_vertex_ai:
        missing = [
            name
            for name in (
                "GOOGLE_CLOUD_PROJECT",
                "GOOGLE_CLOUD_LOCATION",
            )
            if not os.getenv(name)
        ]

        if missing:
            raise RuntimeError(
                "Missing Vertex AI configuration: "
                + ", ".join(missing)
            )

        return

    if not (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    ):
        raise RuntimeError(
            "Google AI credentials are missing. "
            "Set GEMINI_API_KEY or GOOGLE_API_KEY."
        )


def build_response_json_schema(
    model_type: type[BaseModel],
) -> dict[str, Any]:
    schema = model_type.model_json_schema()

    unsupported_keys = {
        "default",
        "examples",
    }

    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            return {
                key: clean(value)
                for key, value in node.items()
                if key not in unsupported_keys
            }

        if isinstance(node, list):
            return [clean(item) for item in node]

        return node

    return clean(schema)


def parse_response_as_model(
    response: object,
    model_type: type[ModelT],
) -> ModelT:
    response_text = getattr(response, "text", None)

    if not response_text:
        raise RuntimeError(
            "Gemini returned no response text."
        )

    try:
        return model_type.model_validate_json(response_text)
    except ValidationError as exc:
        raise RuntimeError(
            "Gemini returned JSON that does not satisfy "
            f"{model_type.__name__}.\n"
            f"Raw response:\n{response_text}"
        ) from exc


def select_model(model: str | None) -> str:
    return (
        model
        or os.getenv("GEMINI_MODEL")
        or "gemini-3.5-flash"
    )


def prepare_generation() -> None:
    load_dotenv()
    validate_google_configuration()


def create_client() -> genai.Client:
    return genai.Client()


def dump_compact_json(model: BaseModel) -> str:
    return model.model_dump_json(
        exclude_none=False,
    )


def is_transient_gemini_error(exc: Exception) -> bool:
    message = str(exc).lower()
    transient_markers = (
        "remoteprotocolerror",
        "server disconnected",
        "connection reset",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "503",
        "500",
        "502",
        "504",
        "connection aborted",
    )
    return any(
        marker in message
        for marker in transient_markers
    )


def generate_json_response(
    *,
    client: genai.Client,
    model: str,
    contents: list[types.Part | str],
    system_instruction: str,
    response_model: type[BaseModel],
    media_resolution: types.MediaResolution = (
        types.MediaResolution.MEDIA_RESOLUTION_HIGH
    ),
    max_attempts: int = 3,
) -> object:
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_json_schema=(
                        build_response_json_schema(
                            response_model
                        )
                    ),
                    media_resolution=media_resolution,
                ),
            )
        except Exception as exc:
            last_exc = exc

            if (
                attempt == max_attempts
                or not is_transient_gemini_error(exc)
            ):
                break

            time.sleep(1.5 * attempt)

    assert last_exc is not None
    raise RuntimeError(
        f"Gemini API request failed using {model!r}: "
        f"{last_exc}"
    ) from last_exc
