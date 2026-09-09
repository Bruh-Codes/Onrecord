import json

import httpx

from app.services.transaction_mapping import OpenAITransactionCategorizer, TransactionLabel


def test_openai_transaction_categorizer_sends_labels_not_amounts(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "output": [{"content": [{"type": "output_text", "text": json.dumps({
                    "categories": [{
                        "source_id": "c0",
                        "category_l1": "opex",
                        "category_l2": "airtime_data",
                        "confidence": 0.93,
                    }]
                })}]}]
            }

    def fake_post(url, **kwargs):
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(httpx, "post", fake_post)
    result = OpenAITransactionCategorizer("secret", "gpt-5.6-luna").categorize([
        TransactionLabel("c0", "MTNONLINEAIRTIMEVENDOR", {"in": 0, "out": 12}, 12)
    ])

    payload = captured["json"]
    assert payload["store"] is False
    supplied = payload["input"][1]["content"]
    assert "amount" not in supplied
    assert "value" not in supplied
    assert result[0].category_l1 == "opex"
    assert result[0].confidence == 0.93
