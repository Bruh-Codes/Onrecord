import json

import httpx

from app.services.financial_mapping import OpenAIFinancialStructureMapper, StructureRow


def test_openai_structure_request_excludes_financial_values_and_validates_ids(monkeypatch):
    captured = {}
    model_output = {
        "statement_type": "income_statement",
        "statement_type_confidence": 0.94,
        "annotations": [
            {
                "source_id": "s0:l0",
                "section": "Operating expenses",
                "parent_source_id": "s0:l1",
                "depth": 0,
                "is_total": True,
                "canonical_concept": "operating_expenses",
                "confidence": 0.95,
            },
            {
                "source_id": "invented",
                "section": None,
                "parent_source_id": None,
                "depth": 0,
                "is_total": False,
                "canonical_concept": None,
                "confidence": 0.5,
            },
        ],
    }

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "output": [{
                    "content": [{"type": "output_text", "text": json.dumps(model_output)}]
                }]
            }

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(httpx, "post", fake_post)
    rows = [
        StructureRow("s0:l0", "Operating costs", 0, None, 0, False),
        StructureRow("s0:l1", "Power expense", 1, None, 0, False),
    ]

    structure = OpenAIFinancialStructureMapper("secret", "gpt-5.6-luna").structure_rows(rows, "other")

    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["json"]["store"] is False
    assert captured["json"]["text"]["format"]["strict"] is True
    supplied = json.loads(captured["json"]["input"][1]["content"])
    assert supplied["rows"] == [
        {
            "source_id": "s0:l0",
            "label": "Operating costs",
            "sequence": 0,
            "detected_section": None,
            "detected_depth": 0,
            "detected_is_total": False,
        },
        {
            "source_id": "s0:l1",
            "label": "Power expense",
            "sequence": 1,
            "detected_section": None,
            "detected_depth": 0,
            "detected_is_total": False,
        },
    ]
    assert all(key not in captured["json"]["input"][1]["content"] for key in ("amount", "value", "period"))
    assert structure is not None
    assert structure.statement_type == "income_statement"
    assert len(structure.annotations) == 1
    assert structure.annotations[0].source_id == "s0:l0"
    assert structure.annotations[0].parent_source_id is None


def test_openai_structure_failure_falls_back_cleanly(monkeypatch):
    def fail(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "post", fail)
    mapper = OpenAIFinancialStructureMapper("secret", "gpt-5.6-luna")

    assert mapper.structure_rows(
        [StructureRow("s0:l0", "Revenue", 0, None, 0, False)],
        "income_statement",
    ) is None
