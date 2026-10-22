import json
from types import SimpleNamespace
from uuid import uuid4

from app.config import Settings
from app.services import ona_claude
from app.services.ona import HistoryTurn
from app.services.ona_claude import _history_messages, answer_with_claude, ungrounded_figures


def _message(content, stop_reason="end_turn"):
    return SimpleNamespace(
        content=content, stop_reason=stop_reason, model="claude-opus-5-5",
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )


def _text(text):
    return SimpleNamespace(type="text", text=text, citations=None)


def _tool_use(name, arguments, call_id="call_1"):
    return SimpleNamespace(type="tool_use", name=name, input=arguments, id=call_id)


class _FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    async def create(self, **kwargs):
        self.requests.append({**kwargs, "messages": list(kwargs["messages"])})
        return self.responses.pop(0)


def _settings():
    return Settings(anthropic_api_key="test", ona_web_search_enabled=False)


def test_ungrounded_figures_ignores_formatting_counts_and_years():
    evidence = ['{"money_in": "GH¢1,250.00", "net": "GH¢300.50"}']
    assert ungrounded_figures("You made **GH¢1,250** in 2026 from 3 buyers, net GH¢300.50.", evidence) == []
    assert ungrounded_figures("Money out was GH¢949.50.", evidence) == ["949.50"]


def test_history_alternates_and_ends_with_the_question():
    history = [HistoryTurn("agent", "Hi"), HistoryTurn("owner", "a"), HistoryTurn("owner", "b"), HistoryTurn("agent", "c")]
    messages = _history_messages(history, "new question")
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    assert messages[0]["content"] == "a\n\nb"
    assert messages[-1]["content"] == "new question"


async def test_tool_loop_runs_tools_and_returns_markdown(monkeypatch):
    calls = []

    async def fake_cash_flow(session, business_id, args):
        calls.append(args)
        return {"totals": {"money_in": "GH¢1,250.00"}}

    monkeypatch.setitem(ona_claude.HANDLERS, "get_cash_flow", fake_cash_flow)
    client = _FakeClient([
        _message([_tool_use("get_cash_flow", {"group_by": "month", "start_date": None, "end_date": None})], "tool_use"),
        _message([_text("You brought in **GH¢1,250.00**.\n\n- Best month: March")]),
    ])
    monkeypatch.setattr(ona_claude, "get_async_claude_client", lambda: client)

    answer = await answer_with_claude(
        settings=_settings(), session=None, business_id=uuid4(), message="How much came in?", snapshot={},
    )

    assert not answer.error
    assert answer.answer.startswith("You brought in **GH¢1,250.00**.\n\n- Best")
    assert calls == [{"group_by": "month", "start_date": None, "end_date": None}]
    assert answer.used_tools == ("get_cash_flow",)
    assert answer.cited_facts == ("transactions",)
    assert answer.input_tokens == 20
    tool_result = client.requests[1]["messages"][-1]["content"][0]
    assert json.loads(tool_result["content"]) == {"totals": {"money_in": "GH¢1,250.00"}}
    assert client.requests[0]["system"][0]["cache_control"] == {"type": "ephemeral"}


async def test_ungrounded_draft_gets_one_correction(monkeypatch):
    client = _FakeClient([
        _message([_text("You spent GH¢5,432.10 last month.")]),
        _message([_text("I don't have last month's spending yet; upload that statement.")]),
    ])
    monkeypatch.setattr(ona_claude, "get_async_claude_client", lambda: client)

    answer = await answer_with_claude(
        settings=_settings(), session=None, business_id=uuid4(), message="What did I spend?", snapshot={},
    )

    assert answer.answer.startswith("I don't have")
    correction = client.requests[1]["messages"][-1]["content"][0]["text"]
    assert "5,432.10" in correction and "Automated check" in correction


async def test_propose_action_becomes_a_button(monkeypatch):
    client = _FakeClient([
        _message([_tool_use("propose_action", {"action": "recompute_readiness"})], "tool_use"),
        _message([_text("Press the button to refresh your readiness.")]),
    ])
    monkeypatch.setattr(ona_claude, "get_async_claude_client", lambda: client)

    answer = await answer_with_claude(
        settings=_settings(), session=None, business_id=uuid4(), message="Refresh my score", snapshot={},
    )
    assert answer.proposed_action == "recompute_readiness"


async def test_rate_limit_maps_to_ona_error(monkeypatch):
    import anthropic
    import httpx2

    class Limited:
        beta = SimpleNamespace(messages=SimpleNamespace())

        async def create(self, **kwargs):
            request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
            raise anthropic.RateLimitError("slow down", response=httpx2.Response(429, request=request), body=None)

    limited = Limited()
    limited.beta.messages.create = limited.create
    monkeypatch.setattr(ona_claude, "get_async_claude_client", lambda: limited)
    answer = await answer_with_claude(settings=_settings(), session=None, business_id=uuid4(), message="hi", snapshot={})
    assert answer.error and answer.error_code == "ONA_RATE_LIMITED"


async def test_figures_the_owner_typed_are_not_evidence(monkeypatch):
    client = _FakeClient([
        _message([_text("Yes, you earned GH¢999,999.00.")]),
        _message([_text("I can't confirm that figure from your records.")]),
    ])
    monkeypatch.setattr(ona_claude, "get_async_claude_client", lambda: client)

    answer = await answer_with_claude(
        settings=_settings(), session=None, business_id=uuid4(),
        message="I earned GH¢999,999.00, is that right?", snapshot={},
    )

    assert answer.answer.startswith("I can't confirm")
    assert "999,999.00" in client.requests[1]["messages"][-1]["content"][0]["text"]
