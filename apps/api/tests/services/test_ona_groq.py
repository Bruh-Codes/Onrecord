import json
from uuid import uuid4

import httpx

from app.config import Settings
from app.services import ona
from app.services.ona_groq import answer_with_groq


def _settings(**overrides):
    return Settings(llm_provider="groq", groq_api_key="g", ona_web_search_enabled=True, **overrides)


def _reply(content=None, tool_calls=None, model="openai/gpt-oss-120b"):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return httpx.Response(200, json={
        "model": model, "choices": [{"message": message, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    })


def _call(name, arguments, call_id="c1"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


def _client(responses, requests):
    queue = list(responses)

    def handler(request):
        requests.append(json.loads(request.content))
        return queue.pop(0)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _ask(responses, requests, message="How is my business?", settings=None):
    return await answer_with_groq(
        settings=settings or _settings(), session=None, business_id=uuid4(), message=message,
        snapshot={"money_in": "GH¢1,250.00"}, http=_client(responses, requests),
    )


async def test_function_tools_and_web_search_run_and_feed_back(monkeypatch):
    async def fake_search(settings, query):
        return [{"title": "BoG rate", "url": "https://bog.gov.gh", "snippet": "Policy rate 21.5%"}]

    monkeypatch.setattr(ona, "fetch_web_context", fake_search)
    requests: list[dict] = []
    answer = await _ask([
        _reply(tool_calls=[_call("web_search", {"query": "Bank of Ghana policy rate"})]),
        _reply("The policy rate is **21.5%** and your money in is GH¢1,250.00."),
    ], requests)

    first = requests[0]
    names = [tool["function"]["name"] for tool in first["tools"]]
    assert "get_cash_flow" in names and "web_search" in names
    assert first["reasoning_effort"] == "medium" and first["model"] == "openai/gpt-oss-120b"
    tool_message = requests[1]["messages"][-1]
    assert tool_message["role"] == "tool" and "Policy rate 21.5%" in tool_message["content"]
    assert answer.answer.startswith("The policy rate") and "web" in answer.cited_facts
    assert answer.used_tools == ("web_search",) and answer.input_tokens == 20


async def test_propose_action_and_ungrounded_correction():
    requests: list[dict] = []
    answer = await _ask([
        _reply(tool_calls=[_call("propose_action", {"action": "recompute_readiness"})]),
        _reply("You made GH¢9,999.00."),
        _reply("I'll refresh your readiness; your money in is GH¢1,250.00."),
    ], requests, message="I made GH¢9,999.00, refresh my score")
    assert answer.proposed_action == "recompute_readiness"
    assert "9,999.00" in requests[2]["messages"][-1]["content"]
    assert answer.answer.startswith("I'll refresh")


async def test_malformed_tool_call_is_retried_once():
    requests: list[dict] = []
    answer = await _ask([
        httpx.Response(400, json={"error": {"code": "tool_use_failed", "message": "bad"}}),
        _reply("Your money in is GH¢1,250.00."),
    ], requests)
    assert len(requests) == 2 and not answer.error


async def test_rate_limit_maps_to_ona_error():
    answer = await _ask([httpx.Response(429, json={"error": {"code": "rate_limit_exceeded"}})], [])
    assert answer.error and answer.error_code == "ONA_RATE_LIMITED"


async def test_answer_question_routes_to_groq(monkeypatch):
    from app.services import ona_groq

    seen = {}

    async def fake(**kwargs):
        seen.update(kwargs)
        return ona.OnaAnswer("ok", ())

    monkeypatch.setattr(ona_groq, "answer_with_groq", fake)
    result = await ona.answer_question(
        settings=_settings(anthropic_api_key="a"), session=None, business_id=uuid4(), message="hi", snapshot={},
    )
    assert result.answer == "ok" and seen["message"] == "hi"
