import json

import httpx

from app.services.document_processing import DocumentCell, DocumentTable
from app.services.universal_extraction import UniversalExtractor


def test_universal_extractor_sends_tables_and_text_and_validates_sources(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"output_text": json.dumps({
                "doc_type": "informal_ledger",
                "confidence": 0.91,
                "findings": ["Direction inferred from the transaction type."],
                "transactions": [
                    {
                        "source_id": "table:0:row:1",
                        "occurred_on": "2026-09-01",
                        "description": "Customer payment",
                        "direction": "in",
                        "amount_pesewas": 10000,
                        "balance_after_pesewas": None,
                    },
                    {
                        "source_id": "invented",
                        "occurred_on": "2026-09-02",
                        "description": "Do not persist",
                        "direction": "out",
                        "amount_pesewas": 1,
                        "balance_after_pesewas": None,
                    },
                ],
            })}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(httpx, "post", fake_post)
    table = DocumentTable(
        page=4,
        row_count=2,
        column_count=2,
        cells=(
            DocumentCell(0, 0, "Date", 4, None),
            DocumentCell(0, 1, "Details", 4, None),
            DocumentCell(1, 0, "2026-09-01", 4, None),
            DocumentCell(1, 1, "Customer payment", 4, None),
        ),
    )

    result = UniversalExtractor("secret", "model", "https://example.test/responses", {}).extract(
        "A text line", [table]
    )

    assert result is not None
    assert len(result.rows) == 1
    assert result.rows[0].page == 4
    assert result.doc_type.value == "informal_ledger"
    supplied = json.loads(captured["json"]["input"][1]["content"])
    assert {item["source_id"] for item in supplied["sources"]} == {"table:0:row:0", "table:0:row:1", "text:0"}
    assert captured["json"]["text"]["format"]["strict"] is True


def test_universal_extractor_failure_returns_none(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: (_ for _ in ()).throw(httpx.ConnectError("offline")))

    result = UniversalExtractor("secret", "model", "https://example.test/responses", {}).extract("date 2026-09-01", [])

    assert result is None
