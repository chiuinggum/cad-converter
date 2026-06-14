"""OpenAI-compatible Pioneer API client for V5 dual-model cross-validation."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

PIONEER_API_URL = os.environ.get(
    "PIONEER_API_URL", "https://api.pioneer.ai/v1/chat/completions"
)
PIONEER_MODEL = os.environ.get("PIONEER_MODEL", "gpt-5.4")
# gpt-5.5 on Pioneer is text-only; V5 cross-validation needs a vision-capable model.
PIONEER_VISION_MODEL = os.environ.get("PIONEER_VISION_MODEL", "gpt-5.4")
PIONEER_API_KEY = os.environ.get("PIONEER_API_KEY", "")

# Models known to fail OpenAI-style image_url requests on Pioneer (text-only routing).
TEXT_ONLY_PIONEER_MODELS = frozenset({"gpt-5.5"})


def pioneer_configured() -> bool:
    return bool(PIONEER_API_KEY and PIONEER_API_KEY.strip())


def _parse_http_error(status: int, detail: str) -> str:
    try:
        payload = json.loads(detail)
    except json.JSONDecodeError:
        return f"Pioneer API HTTP {status}: {detail[:800]}"

    if isinstance(payload, dict) and isinstance(payload.get("detail"), dict):
        info = payload["detail"]
        code = info.get("code", "")
        message = info.get("message", "")
        billing_url = info.get("billing_url", "")
        if code == "card_verification_required":
            hint = (
                "Pioneer account billing is required before inference can run. "
                "Subscribe to Hobby or Pro and add a payment method."
            )
            if billing_url:
                hint += f" Billing: {billing_url}"
            return hint
        if message:
            return f"Pioneer API HTTP {status}: {message}"

    if status == 404 and "Provider returned error" in detail:
        return (
            "Pioneer API HTTP 404: upstream provider error. "
            f"If this was a vision request, {PIONEER_VISION_MODEL!r} may not support images "
            f"(e.g. gpt-5.5 is text-only on Pioneer — use PIONEER_VISION_MODEL=gpt-5.4 or claude-opus-4-8)."
        )

    if status == 404 and "not a recognised model id" in detail:
        return (
            "Pioneer API HTTP 404: model not found. For fine-tuned models pass the training-job "
            "UUID as PIONEER_CQ_MODEL (see data/BenchCAD/sft/uploads/pioneer_run_*.json)."
        )

    return f"Pioneer API HTTP {status}: {detail[:800]}"


def _request(payload: Dict[str, Any]) -> str:
    text, _ = _request_with_meta(payload)
    return text


def _request_with_meta(payload: Dict[str, Any]) -> tuple[str, Dict[str, Any]]:
    if not pioneer_configured():
        raise RuntimeError("PIONEER_API_KEY is not configured")

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        PIONEER_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {PIONEER_API_KEY}",
            "X-API-Key": PIONEER_API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(_parse_http_error(exc.code, detail)) from exc

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Pioneer API returned no choices: {json.dumps(data)[:500]}")
    choice = choices[0]
    message = dict(choice.get("message") or {})
    if choice.get("finish_reason"):
        message["finish_reason"] = choice["finish_reason"]
    try:
        text = _extract_assistant_text(message)
    except RuntimeError as exc:
        text = _extract_assistant_text(message, strict=False)
        if not text:
            raise exc
    return text, message


def extract_cadquery_from_text(text: str) -> str:
    """Pull CadQuery Python from assistant content or truncated reasoning."""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    for pattern in (
        r"```python\s*([\s\S]*?)```",
        r"```\s*([\s\S]*?)```",
    ):
        match = re.search(pattern, cleaned, re.IGNORECASE)
        if match:
            block = match.group(1).strip()
            if "cadquery" in block.lower() or "cq." in block:
                return block

    match = re.search(r"(import cadquery[\s\S]+)", cleaned, re.IGNORECASE)
    if match:
        block = match.group(1).strip()
        if block.endswith("```"):
            block = block[:-3].strip()
        return block

    if re.search(r"\bcq\.Workplane\b", cleaned):
        return "import cadquery as cq\n\n" + cleaned.strip()

    return ""


def _extract_assistant_text(message: Dict[str, Any], *, strict: bool = True) -> str:
    content = message.get("content", "")
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
        content = "\n".join(parts)
    content = (content or "").strip()
    if content:
        extracted = extract_cadquery_from_text(content)
        return extracted or content

    reasoning = (message.get("reasoning_content") or "").strip()
    if reasoning:
        extracted = extract_cadquery_from_text(reasoning)
        if extracted:
            return extracted

    if not strict:
        return ""

    finish = message.get("finish_reason") or ""
    hint = " Increase PIONEER_CQ_MAX_TOKENS or retry."
    if finish == "length":
        hint = " Model hit max_tokens during reasoning; retrying with a code-only nudge."
    raise RuntimeError(
        "Pioneer model returned reasoning only (no code in content)." + hint
    )


def _vision_model(explicit: Optional[str] = None) -> str:
    chosen = explicit or PIONEER_VISION_MODEL or PIONEER_MODEL
    if chosen in TEXT_ONLY_PIONEER_MODELS:
        return PIONEER_VISION_MODEL if PIONEER_VISION_MODEL not in TEXT_ONLY_PIONEER_MODELS else "gpt-5.4"
    return chosen


def pioneer_chat(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    temperature: float = 0,
    max_tokens: int = 8192,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    payload: Dict[str, Any] = {
        "model": model or PIONEER_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if extra:
        payload.update(extra)
    return _request(payload)


def pioneer_chat_with_meta(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    temperature: float = 0,
    max_tokens: int = 8192,
    extra: Optional[Dict[str, Any]] = None,
) -> tuple[str, Dict[str, Any]]:
    payload: Dict[str, Any] = {
        "model": model or PIONEER_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if extra:
        payload.update(extra)
    return _request_with_meta(payload)


def _image_content_parts(
    user_text: str,
    image_b64: Optional[str],
    mime_type: Optional[str],
) -> Any:
    if not image_b64:
        return user_text
    raw = image_b64.split("base64,")[-1] if "base64," in image_b64 else image_b64
    mime = mime_type or "image/png"
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{raw}"},
        },
        {"type": "text", "text": user_text},
    ]


def pioneer_chat_with_image(
    system: str,
    user_text: str,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
    *,
    model: Optional[str] = None,
    temperature: float = 0,
    max_tokens: int = 8192,
) -> str:
    user_content = _image_content_parts(user_text, image_b64, mime_type)
    messages: List[Dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user_content})
    return pioneer_chat(
        messages,
        model=_vision_model(model),
        temperature=temperature,
        max_tokens=max_tokens,
    )


def extract_json_object(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


def pioneer_json_with_image(
    system: str,
    user_text: str,
    image_b64: Optional[str] = None,
    mime_type: Optional[str] = None,
    *,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    prompt = user_text + "\n\nReturn ONLY valid JSON. No markdown fences or prose."
    text = pioneer_chat_with_image(
        system,
        prompt,
        image_b64=image_b64,
        mime_type=mime_type,
        model=model,
    )
    return extract_json_object(text)
