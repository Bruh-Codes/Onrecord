import json as json_module

import httpx

from app.models.enums import DocType, Provider
from app.pipeline.s2_classify_ai import classify_document_with_ai


def test_validates_ai_classification_response(monkeypatch):
    captured = {}

    def fake_post(url, *, headers=None, json=None, timeout=None):
        captured["json"] = json

        class Response:
            is_error = False

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "output_text": json_module.dumps(
                        {
                            "doc_type": "bank_statement",
                            "confidence": 0.91,
                            "is_financial_document": True,
                            "issuer": "GCB",
                            "period_start": "2026-01-01",
                            "period_end": "2026-01-31",
                            "reason": "Bank statement with transaction table",
                        }
                    )
                }

        return Response()

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(
        "app.pipeline.s2_classify_ai.get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "llm_api_key": "test-key",
                "financial_mapping_model": "gpt-test",
                "responses_api_url": "https://example.test/responses",
                "responses_options": lambda self: {},
            },
        )(),
    )

    result = classify_document_with_ai("Transaction Date Debit Credit", "statement.pdf", has_tables=True)

    assert result is not None
    assert result.doc_type == DocType.BANK_STATEMENT
    assert result.issuer == Provider.GCB
    assert result.period_start.isoformat() == "2026-01-01"
    assert captured["json"]["text"]["format"]["name"] == "document_classification"
