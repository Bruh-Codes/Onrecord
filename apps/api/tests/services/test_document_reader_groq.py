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


def _text_pdf(lines: list[list[tuple[int, str]]]) -> bytes:
    """A one-page PDF whose lines are cells drawn at x positions, like a statement table."""
    ops = ["BT /F1 9 Tf"]
    for index, cells in enumerate(lines):
        for x, text in cells:
            ops.append(f"1 0 0 1 {x} {500 - index * 20} Tm ({text}) Tj")
    ops.append("ET")
    stream = "\n".join(ops).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 600] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def test_pdf_text_layer_keeps_each_table_row_on_one_line():
    from app.services.document_reader_groq import _page_texts

    columns = (40, 200, 330, 420, 520, 620)
    rows = [
        ["TRANSACTION DATE", "FROM NAME", "TRANS. TYPE", "AMOUNT", "BAL BEFORE", "BAL AFTER"],
        ["30-Oct-2026", "EDITH DOH", "TRANSFER", "350", "1914.77", "1562.15"],
    ]
    text = _page_texts(_text_pdf([list(zip(columns, row)) for row in rows]))[0]
    row_lines = [line for line in text.splitlines() if "30-Oct-2026" in line]
    assert len(row_lines) == 1 and "1914.77" in row_lines[0] and "1562.15" in row_lines[0]
    assert "      " not in row_lines[0]  # wide gaps are shortened


def _rows_reply(count: int, finish: str = "stop") -> httpx.Response:
    row = _payload()["transactions"][0]
    payload = _payload(transactions=[{**row, "reference": f"R{n}"} for n in range(count)])
    return httpx.Response(200, json={"model": "openai/gpt-oss-120b", "choices": [
        {"finish_reason": finish, "message": {"content": json.dumps(payload)}},
    ]})


def test_short_answer_is_read_again_in_two_halves():
    lines = "\n".join(f"{day:02d}-Oct-2026   PAYMENT_RECEIVED   AMA   {day}.00" for day in range(1, 21))
    requests: list[dict] = []
    # 20 dated lines but only 5 rows back: the chunk is split and each half read again.
    reading = _reader(requests, [_rows_reply(5), _rows_reply(10), _rows_reply(10)]).read(lines.encode(), "pasted.txt", None)
    assert len(requests) == 3 and len(reading.rows) == 20
    first_half = requests[1]["messages"][1]["content"][0]["text"]
    assert "01-Oct-2026" in first_half and "20-Oct-2026" not in first_half


def test_full_answer_is_not_split():
    lines = "\n".join(f"{day:02d}-Oct-2026   PAYMENT_RECEIVED   AMA   {day}.00" for day in range(1, 11))
    requests: list[dict] = []
    reading = _reader(requests, [_rows_reply(10)]).read(lines.encode(), "pasted.txt", None)
    assert len(requests) == 1 and len(reading.rows) == 10


def test_long_text_is_sent_in_small_chunks():
    from app.services.document_reader_groq import SOURCES_PER_CHUNK

    lines = "\n".join(f"line {n}" for n in range(SOURCES_PER_CHUNK * 2 + 1))
    assert len(_reader([]).build_chunks(lines.encode(), "pasted.txt", None)) == 3


def test_digital_pdf_prefers_its_text_layer_over_docling():
    requests: list[dict] = []
    pdf = _text_pdf([[(40, "30-Oct-2026"), (200, "EDITH DOH"), (420, "350")]])
    processed = ProcessedDocument(text="garbled docling table", page_count=1, structure={}, tables=())
    _reader(requests).read(pdf, "statement.pdf", processed)
    text = requests[0]["messages"][1]["content"][0]["text"]
    assert "EDITH DOH" in text and "garbled" not in text
