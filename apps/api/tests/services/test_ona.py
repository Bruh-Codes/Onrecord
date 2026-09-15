from app.services.ona import CITATION_KEYS, HistoryTurn, _build_input, _snapshot_for_turn, _validate_answer
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
