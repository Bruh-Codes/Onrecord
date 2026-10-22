import io
import json

import httpx
from pypdf import PdfWriter

from app.config import Settings
from app.services.document_processing import ProcessedDocument
from app.services.document_reader import ClaudeDocumentReader, get_document_reader
from app.services.document_reader_groq import GroqDocumentReader
from tests.services.test_document_reader import _payload


def _blank_pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _reader(requests, responses=None):
    queue = list(responses or [])

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        if queue:
            return queue.pop(0)
        return httpx.Response(200, json={
            "model": requests[-1]["model"],
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(_payload())}}],
        })

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return GroqDocumentReader("key", "https://groq.test/v1/chat/completions", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", http)


def test_provider_follows_llm_provider(monkeypatch):
    from app.services import document_reader

    monkeypatch.setattr(document_reader, "get_settings", lambda: Settings(llm_provider="groq", groq_api_key="g", anthropic_api_key="a"))
    assert isinstance(get_document_reader(), GroqDocumentReader)
    monkeypatch.setattr(document_reader, "get_settings", lambda: Settings(llm_provider="openai", anthropic_api_key="a"))
    monkeypatch.setattr(document_reader, "get_claude_client", lambda: object())
    assert isinstance(get_document_reader(), ClaudeDocumentReader)


def test_pasted_text_goes_to_the_text_model_with_strict_schema():
    requests: list[dict] = []
    reading = _reader(requests).read(b"Received GHS 10.00 from AMA", "pasted.txt", None)
    body = requests[0]
    assert body["model"] == "openai/gpt-oss-120b" and body["reasoning_effort"] == "medium"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert reading.rows[0].amount == "10.00" and reading.model == "groq:openai/gpt-oss-120b"


def test_photos_go_to_the_vision_model():
    requests: list[dict] = []
    _reader(requests).read(b"\x89PNG....", "receipt.png", None)
    body = requests[0]
    assert body["model"] == "qwen/qwen3.8-27b" and "reasoning_effort" not in body
    image = body["messages"][1]["content"][0]
    assert image["type"] == "image_url" and image["image_url"]["url"].startswith("data:image/png;base64,")


def test_pdf_uses_docling_capture_when_it_has_text():
    requests: list[dict] = []
    processed = ProcessedDocument(text="02/01/2026 Cash in 10.00", page_count=1, structure={}, tables=())
    _reader(requests).read(_blank_pdf(1), "statement.pdf", processed)
    assert requests[0]["model"] == "openai/gpt-oss-120b"
    assert "Cash in 10.00" in requests[0]["messages"][1]["content"][0]["text"]


def test_scanned_pdf_pages_are_rendered_three_per_request():
    requests: list[dict] = []
    reading = _reader(requests).read(_blank_pdf(4), "scan.pdf", None)
    assert [body["model"] for body in requests] == ["qwen/qwen3.8-27b"] * 2
    images = [[part for part in body["messages"][1]["content"] if part["type"] == "image_url"] for body in requests]
    assert [len(batch) for batch in images] == [3, 1]
    assert requests[1]["messages"][1]["content"][0]["text"] == "Page 4:"
    assert reading.chunks == 2


def test_rate_limit_is_retried_and_truncation_is_reported(monkeypatch):
    from app.services import document_reader_groq

    monkeypatch.setattr(document_reader_groq.time, "sleep", lambda _: None)
    requests: list[dict] = []
    responses = [
        httpx.Response(429, headers={"retry-after": "1"}),
        httpx.Response(200, json={"model": "openai/gpt-oss-120b", "choices": [
            {"finish_reason": "length", "message": {"content": json.dumps(_payload())}},
        ]}),
    ]
    reading = _reader(requests, responses).read(b"line", "pasted.txt", None)
    assert len(requests) == 2 and reading.truncated is True
