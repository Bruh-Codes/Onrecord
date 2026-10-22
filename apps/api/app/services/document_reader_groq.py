"""Document reading on Groq's OpenAI-compatible chat completions API.

Groq has no PDF input and its vision model takes at most 3 images per
request, so documents are prepared differently from the Claude reader:

- PDFs use Docling's capture (tables, text, OCR) when it has content, then
  the embedded text layer page by page; pages with no text at all (scans)
  are rendered to JPEG and sent to the vision model three at a time.
- Photos and screenshots go to the vision model, downscaled when large.
- Spreadsheets, CSV, XML and pasted text go as source-id rows, as for Claude.

Both models answer with strict structured outputs against reading_schema(),
and the result goes through the same parse_reading/merge_readings path.
"""

import base64
import io
import json
import logging
import time
from pathlib import Path

import httpx

from app.config import Settings
from app.services.document_processing import ProcessedDocument
from app.services.document_reader import (
    _IMAGE_TYPES,
    INSTRUCTIONS,
    DocumentReader,
    DocumentReaderError,
    DocumentReading,
    _Chunk,
    _line_sources,
    _sources,
    _text_sources,
    parse_reading,
    reading_schema,
    source_chunks,
)

logger = logging.getLogger(__name__)

IMAGES_PER_REQUEST = 3
MAX_IMAGE_BYTES = 3_500_000
MAX_IMAGE_SIDE = 2000
TEXT_MAX_TOKENS = 32_000
VISION_MAX_TOKENS = 16_000
RETRIES = 2

VISION_NOTE = (
    "Each image is preceded by a line naming its page number. Use that number as page, "
    "and \"page:N\" as source_ref."
)


class GroqDocumentReader(DocumentReader):
    # Groq rate limits are per minute; two parallel chunks keep a long
    # statement from tripping them.
    max_parallel_chunks = 2

    def __init__(self, api_key: str, url: str, text_model: str, vision_model: str, http: httpx.Client | None = None):
        self.api_key = api_key
        self.url = url
        self.text_model = text_model
        self.model = f"groq:{text_model}"
        self.vision_model = vision_model
        self.http = http or httpx.Client(timeout=300)

    @classmethod
    def from_settings(cls, settings: Settings) -> "GroqDocumentReader":
        return cls(settings.groq_api_key, settings.groq_api_url, settings.groq_extraction_model, settings.groq_vision_model)

    def build_chunks(self, payload: bytes, filename: str, processed: ProcessedDocument | None) -> list[_Chunk]:
        suffix = Path(filename).suffix.lower()
        if suffix == ".pdf" or payload[:5] == b"%PDF-":
            return _pdf_chunks(payload, processed)
        if suffix in _IMAGE_TYPES:
            return [_Chunk([_image_part(payload, _IMAGE_TYPES[suffix])], label="photo")]
        return source_chunks(_sources(processed) if processed else _text_sources(payload))

    def _read_chunk(self, chunk: _Chunk, index: int, total: int) -> DocumentReading:
        vision = any(part["type"] == "image_url" for part in chunk.content)
        model = self.vision_model if vision else self.text_model
        position = f"This is part {index} of {total}{f' ({chunk.label})' if chunk.label else ''}."
        prompt = f"{position}\n{VISION_NOTE if vision else ''}\nExtract the transactions and document facts."
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": INSTRUCTIONS},
                {"role": "user", "content": [*chunk.content, {"type": "text", "text": prompt}]},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "document_reading", "strict": True, "schema": reading_schema()},
            },
            "max_completion_tokens": VISION_MAX_TOKENS if vision else TEXT_MAX_TOKENS,
        }
        if model.startswith("openai/gpt-oss-"):
            body["reasoning_effort"] = "medium"
        data = self._post(body)
        choice = (data.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content")
        if not text:
            raise DocumentReaderError("The document reader returned no answer.")
        try:
            reading = json.loads(text)
        except json.JSONDecodeError as error:
            raise DocumentReaderError("The document reader's answer was incomplete.") from error
        return parse_reading(
            reading,
            model=f"groq:{data.get('model') or model}",
            page_offset=chunk.page_offset,
            source_pages=chunk.source_pages,
            truncated=choice.get("finish_reason") == "length",
        )

    def _post(self, body: dict) -> dict:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        for attempt in range(RETRIES + 1):
            try:
                response = self.http.post(self.url, json=body, headers=headers)
            except httpx.HTTPError as error:
                logger.warning("Groq document read failed: %s", type(error).__name__)
                raise DocumentReaderError("The document reader is unavailable.") from error
            if response.status_code in (429, 500, 502, 503) and attempt < RETRIES:
                time.sleep(min(float(response.headers.get("retry-after") or 2 ** (attempt + 1)), 30))
                continue
            if response.status_code >= 400:
                logger.warning("Groq document read failed: HTTP %s", response.status_code)
                raise DocumentReaderError("The document reader is unavailable.")
            return response.json()
        raise DocumentReaderError("The document reader is unavailable.")


def _pdf_chunks(payload: bytes, processed: ProcessedDocument | None) -> list[_Chunk]:
    if processed and (processed.tables or processed.text.strip()):
        return source_chunks(_sources(processed))
    texts = _page_texts(payload)
    sources = [
        source
        for number, text in enumerate(texts, start=1)
        for source in _line_sources(text, page=number, prefix=f"p{number}:line")
    ]
    chunks = source_chunks(sources)
    scanned = [number for number, text in enumerate(texts, start=1) if not text.strip()]
    for start in range(0, len(scanned), IMAGES_PER_REQUEST):
        pages = scanned[start : start + IMAGES_PER_REQUEST]
        content: list[dict] = []
        for number in pages:
            image = _render_page(payload, number - 1)
            if image is not None:
                content += [{"type": "text", "text": f"Page {number}:"}, _image_part(image, "image/jpeg")]
        if content:
            chunks.append(_Chunk(content, label=f"scanned pages {', '.join(map(str, pages))} of {len(texts)}"))
    return chunks


def _page_texts(payload: bytes) -> list[str]:
    from pypdf import PdfReader

    try:
        return [page.extract_text() or "" for page in PdfReader(io.BytesIO(payload)).pages]
    except Exception:  # pypdf raises many types for damaged/encrypted files
        return []


def _render_page(payload: bytes, index: int) -> bytes | None:
    try:
        import pypdfium2  # installed with Docling

        page = pypdfium2.PdfDocument(payload)[index]
        image = page.render(scale=2).to_pil()
    except Exception:  # missing library or unrenderable page
        logger.warning("Could not render PDF page %s for the vision model", index + 1)
        return None
    return _jpeg(image)


def _image_part(data: bytes, media_type: str) -> dict:
    if len(data) > MAX_IMAGE_BYTES:
        try:
            from PIL import Image

            data, media_type = _jpeg(Image.open(io.BytesIO(data))), "image/jpeg"
        except Exception:  # keep the original; Groq rejects it with a clear error
            logger.warning("Could not downscale a large image for the vision model")
    encoded = base64.standard_b64encode(data).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{encoded}"}}


def _jpeg(image) -> bytes:
    image = image.convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()
