from fastapi import APIRouter, Depends, File, UploadFile
import httpx

from app.api.deps import Claims, verify_token
from app.config import Settings, get_settings
from app.errors import AppError

router = APIRouter(tags=["voice"])


@router.post("/v1/voice/transcribe")
async def transcribe_voice(
    audio: UploadFile = File(...),
    claims: Claims = Depends(verify_token),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    del claims
    if not settings.llm_api_key:
        raise AppError("VOICE_NOT_CONFIGURED", "Voice transcription is not configured.", 503)

    content = await audio.read()
    if not content:
        raise AppError("VOICE_EMPTY", "No audio was recorded.", 400)
    if len(content) > 25 * 1024 * 1024:
        raise AppError("VOICE_TOO_LARGE", "The recording is too large.", 413)

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                files={
                    "file": (
                        audio.filename or "recording.webm",
                        content,
                        audio.content_type or "audio/webm",
                    )
                },
                data={
                    "model": "whisper-large-v3-turbo",
                    "language": "en",
                    "response_format": "json",
                    "temperature": "0",
                },
            )
    except httpx.HTTPError as error:
        raise AppError("VOICE_PROVIDER_UNAVAILABLE", "Groq voice transcription is unavailable.", 503) from error

    if not response.is_success:
        detail = response.json().get("error", {}).get("message") if response.headers.get("content-type", "").startswith("application/json") else None
        raise AppError("VOICE_PROVIDER_ERROR", detail or "Groq could not transcribe the recording.", 502)

    return {"text": response.json().get("text", "").strip()}
