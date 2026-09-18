from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.config import Settings
from app.services import ona
from app.services.ona import CITATION_KEYS, HistoryTurn, _build_input, _function_calls, _snapshot_for_turn, _validate_answer
from app.services.ona_web import is_casual_turn


def test_ona_response_accepts_expanded_citations():
    answer = _validate_answer({
        "answer": "  Your score is based on the data currently available.  ",
        "cited_facts": ["readiness_score", "not_a_real_fact", "indicators", "gap_details"],
    })

    assert answer.answer == "Your score is based on the data currently available."
    assert answer.cited_facts == ("readiness_score", "indicators", "gap_details")


def test_ona_drops_unapproved_action_names():
    answer = _validate_answer({
        "answer": "I can help you review that.",
        "cited_facts": [],
        "proposed_action": "delete_everything",
    })

    assert answer.proposed_action is None


def test_ona_allows_only_the_two_confirmation_gated_tools():
    answer = _validate_answer({
        "answer": "I can retry the queued uploads after you confirm.",
        "cited_facts": ["documents"],
        "proposed_action": "retry_stuck_documents",
    })

    assert answer.proposed_action == "retry_stuck_documents"


def test_build_input_includes_history_and_snapshot():
    turns = _build_input(
        "What gaps matter most?",
        {"readiness_score": {"total": 42.0}},
        [HistoryTurn(role="owner", content="Hi"), HistoryTurn(role="agent", content="Hello.")],
        [],
    )
    assert turns[0]["role"] == "developer"
    assert turns[1]["content"] == "Hi"
    assert turns[2]["role"] == "assistant"
    assert "verified_facts" in turns[-1]["content"]
    assert "readiness_score" in turns[-1]["content"]


def test_citation_keys_cover_snapshot_sections():
    assert "transactions" in CITATION_KEYS
    assert "counterparties" in CITATION_KEYS


def test_ona_instructions_ground_spending_and_documents():
    turns = _build_input(
        "What do I spend money on most?",
        {
            "transactions": {
                "spending_by_category": [
                    {"category_l1": "inventory", "volume_pesewas": 12000}
                ]
            },
            "documents": {"by_type": {"bank_statement": 1}},
            "checklist": {"items_missing": [{"doc_type": "tax_doc"}]},
        },
        [],
        [],
    )
    assert "spending_by_category" in turns[-1]["content"]
    assert "checklist requirement as an uploaded document" in turns[0]["content"]


def test_casual_turn_skips_heavy_snapshot():
    assert is_casual_turn("Hi")
    snapshot = _snapshot_for_turn("Hi", {"readiness_score": {"total": 0}, "gap_details": [{"title": "bank"}]})
    assert "readiness_score" not in snapshot
    assert "gap_details" not in snapshot
    assert snapshot["_note"]


def test_ona_allows_empty_citations_for_general_answers():
    answer = _validate_answer({
        "answer": "Register your business, open a dedicated MoMo or bank account, and keep every receipt.",
        "cited_facts": [],
        "proposed_action": None,
    })
    assert answer.cited_facts == ()


def test_function_calls_are_parsed_only_from_function_call_items():
    calls = _function_calls({
        "output": [
            {"type": "reasoning"},
            {"type": "function_call", "name": "get_spending_summary", "call_id": "call_1", "arguments": "{}"},
        ]
    })
    assert calls == [{"name": "get_spending_summary", "call_id": "call_1", "arguments": "{}"}]


@pytest.mark.asyncio
async def test_ona_executes_a_read_only_tool_before_final_answer(monkeypatch):
    responses = [
        SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "output": [{
                    "type": "function_call",
                    "name": "get_spending_summary",
                    "call_id": "call_1",
                    "arguments": "{}",
                }],
                "usage": {},
            },
        ),
        SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "output_text": '{"answer":"Your largest spending category is inventory.","cited_facts":["transactions"],"proposed_action":null}',
                "usage": {},
            },
        ),
    ]

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            requests.append(kwargs["json"])
            return responses.pop(0)

    calls = []
    requests = []

    async def fake_tool(session, business_id, name, arguments):
        calls.append((session, business_id, name, arguments))
        return {"transactions": {"by_category": [{"category_l1": "inventory"}]}}

    monkeypatch.setattr(ona.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    monkeypatch.setattr(ona, "execute_ona_tool", fake_tool)
    result = await ona.answer_question(
        settings=Settings(openai_api_key="test", ona_model="test"),
        session=object(),
        business_id=uuid4(),
        message="What do I spend money on most?",
        snapshot={"transactions": {"spending_by_category": []}},
    )
    assert result.answer == "Your largest spending category is inventory."
    assert calls[0][2] == "get_spending_summary"
    assert "tools" in requests[0]
    assert "text" not in requests[0]
    assert "tools" not in requests[1]
    assert requests[1]["text"]["format"]["type"] == "json_schema"
