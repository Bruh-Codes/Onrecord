import io
import json
from types import SimpleNamespace

import pytest
from pypdf import PdfWriter

from app.services.document_processing import DocumentCell, DocumentTable, ProcessedDocument
from app.services.document_reader import (
    ClaudeDocumentReader,
    DocumentReaderError,
    build_chunks,
    merge_readings,
    parse_reading,
    reading_schema,
)


def _pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _payload(**overrides):
    base = {
        "doc_type": "momo_statement", "provider": "MTN", "account_label": "1234", "currency": "GHS",
        "period_start": "2026-01-01", "period_end": "2026-01-31", "opening_balance": "10.00",
        "closing_balance": "20.00", "confidence": 0.9, "summary": "An MTN statement.", "findings": [],
        "transactions": [{
            "occurred_on": "2026-01-02", "description": "Cash in", "counterparty": None, "reference": "R1",
            "direction": "in", "amount": "10.00", "fee": None, "levy": None, "balance_after": "20.00",
            "category": "revenue", "page": 2, "source_ref": "page:2",
        }],
    }
    return {**base, **overrides}


def test_short_pdf_is_sent_whole_and_long_pdf_is_split_by_pages():
    assert len(build_chunks(_pdf(3), "statement.pdf", None)) == 1
    chunks = build_chunks(_pdf(20), "statement.pdf", None)
    assert [chunk.page_offset for chunk in chunks] == [0, 8, 16]
    assert chunks[0].content[0]["type"] == "document"


def test_images_are_sent_as_image_blocks():
    chunk = build_chunks(b"\x89PNG....", "screenshot.PNG", None)[0]
    assert chunk.content[0]["type"] == "image"
    assert chunk.content[0]["source"]["media_type"] == "image/png"


def test_tables_become_rows_with_source_ids():
    table = DocumentTable(page=3, row_count=2, column_count=2, cells=(
        DocumentCell(0, 0, "Date", 3, None), DocumentCell(0, 1, "Amount", 3, None),
        DocumentCell(1, 0, "2026-01-02", 3, None), DocumentCell(1, 1, "10.00", 3, None),
    ))
    processed = ProcessedDocument(text="", page_count=1, structure={}, tables=(table,))
    chunk = build_chunks(b"", "ledger.xlsx", processed)[0]
    assert chunk.source_pages == {"table:0:row:0": 3, "table:0:row:1": 3}
    assert "table:0:row:1" in chunk.content[0]["text"]


def test_pasted_text_is_split_into_lines():
    chunk = build_chunks(b"Payment received for GHS 50.00\n\nCash out GHS 20.00", "sms.txt", None)[0]
    assert set(chunk.source_pages) == {"text:0", "text:2"}


def test_parse_reading_offsets_pages_and_ignores_unknown_enums():
    reading = parse_reading(_payload(doc_type="nonsense"), model="m", page_offset=8)
    assert reading.doc_type == "other"
    assert reading.rows[0].page == 10


def _dated(day: str, **overrides):
    payload = _payload(**overrides)
    payload["transactions"] = [{**payload["transactions"][0], "occurred_on": day}]
    return payload


def test_merge_takes_opening_from_first_and_closing_from_last_part():
    first = parse_reading(_dated("2026-01-02", closing_balance=None), model="m")
    last = parse_reading(_dated("2026-01-20", opening_balance=None, closing_balance="99.00", confidence=0.6), model="m")
    merged = merge_readings([first, last], "m")
    assert merged.opening_balance == "10.00" and merged.closing_balance == "99.00"
    assert merged.confidence == 0.6 and len(merged.rows) == 2 and merged.chunks == 2


def test_merge_follows_row_dates_for_newest_first_statements():
    # MTN lists newest rows first, so the first part holds the latest rows.
    newest = parse_reading(_dated("2026-01-20", opening_balance="50.00", closing_balance="99.00"), model="m")
    oldest = parse_reading(_dated("2026-01-02", opening_balance="10.00", closing_balance="50.00"), model="m")
    merged = merge_readings([newest, oldest], "m")
    assert merged.opening_balance == "10.00" and merged.closing_balance == "99.00"


def test_merge_drops_balances_when_the_span_is_ambiguous():
    first = parse_reading(_dated("2026-01-02", opening_balance="10.00", closing_balance=None), model="m")
    second = parse_reading(_dated("2026-01-02", opening_balance="12.00", closing_balance="20.00"), model="m")
    merged = merge_readings([first, second], "m")
    assert merged.opening_balance is None and merged.closing_balance is None


def test_chunks_repeat_table_headers_and_keep_rows_whole(monkeypatch):
    monkeypatch.setattr("app.services.document_reader.SOURCES_PER_CHUNK", 2)
    cells = [DocumentCell(0, 0, "Date", 1, None, column_header=True), DocumentCell(0, 1, "BAL AFTER", 1, None, column_header=True)]
    for row in range(1, 4):
        cells += [DocumentCell(row, 0, f"2026-01-0{row}", 1, None), DocumentCell(row, 1, f"{row}0.00", 1, None)]
    table = DocumentTable(page=1, row_count=4, column_count=2, cells=tuple(cells))
    processed = ProcessedDocument(text="", page_count=1, structure={}, tables=(table,))
    first, second = build_chunks(b"", "ledger.xlsx", processed)
    assert "Column headers" not in first.content[0]["text"]
    text = second.content[0]["text"]
    assert text.startswith("Column headers") and "BAL AFTER" in text
    # Headers are context only: they are not cited rows of the second chunk.
    assert set(second.source_pages) == {"table:0:row:2", "table:0:row:3"}


def test_balance_before_is_read():
    payload = _payload()
    payload["transactions"][0]["balance_before"] = "10.00"
    assert parse_reading(payload, model="m").rows[0].balance_before == "10.00"


def test_schema_requires_every_property():
    schema = reading_schema()
    assert set(schema["required"]) == set(schema["properties"])
    row = schema["properties"]["transactions"]["items"]
    assert set(row["required"]) == set(row["properties"])


class _FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


def _client(message, calls):
    def stream(**kwargs):
        calls.append(kwargs)
        return _FakeStream(message)

    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))


def test_reader_sends_structured_output_request_and_parses_answer():
    calls: list[dict] = []
    message = SimpleNamespace(
        stop_reason="end_turn", model="claude-opus-5-5",
        content=[SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=json.dumps(_payload()))],
    )
    reading = ClaudeDocumentReader(_client(message, calls), "claude-opus-5-5", "medium").read(_pdf(1), "s.pdf", None)
    assert reading.rows[0].amount == "10.00"
    assert calls[0]["output_config"]["format"]["type"] == "json_schema"
    assert calls[0]["fallbacks"] == "default"


def test_reader_raises_on_refusal():
    message = SimpleNamespace(stop_reason="refusal", model="m", content=[])
    with pytest.raises(DocumentReaderError):
        ClaudeDocumentReader(_client(message, []), "m", "medium").read(_pdf(1), "s.pdf", None)
