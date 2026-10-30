"""Ona on Groq: the same read-only tool loop as ona_claude, over chat completions.

Groq serves OpenAI-compatible function calling, so the tools, instructions,
history handling and grounding check are shared with the Claude loop. Groq
has no hosted web search; the web_search tool runs the existing search
helper (Tavily, Brave or DuckDuckGo) and its snippets count as evidence.
"""

import json
import logging
from collections.abc import Sequence
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.services import ona
from app.services.ona import HistoryTurn, OnaAnswer
from app.services.ona_claude import (
    INSTRUCTIONS,
    MAX_ROUNDS,
    _citations,
    _context,
    _correction,
    _history_messages,
    _run_tool,
    ungrounded_figures,
)
from app.services.ona_tools import TOOL_DEFINITIONS

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 4000
WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for outside facts: loan products, interest rates, GRA rules, market prices, regulations.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "A short search query."}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
}


class _GroqError(Exception):
    def __init__(self, status: int, code: str | None = None):
        super().__init__(status)
        self.status = status
        self.code = code


def _function_tools(web_search: bool) -> list[dict[str, Any]]:
    tools = [
        {"type": "function", "function": {
            "name": tool["name"], "description": tool["description"], "parameters": tool["input_schema"],
        }}
        for tool in TOOL_DEFINITIONS
    ]
    return [*tools, WEB_SEARCH_TOOL] if web_search else tools


async def answer_with_groq(
    *,
    settings: Settings,
    session: AsyncSession,
    business_id: UUID,
    message: str,
    snapshot: dict[str, Any],
    history: Sequence[HistoryTurn] = (),
    http: httpx.AsyncClient | None = None,
) -> OnaAnswer:
    model = settings.ona_model or settings.groq_ona_model
    snapshot_json = json.dumps(snapshot, ensure_ascii=False, default=str)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": f"{INSTRUCTIONS}\n\n{_context(snapshot_json)}"},
        *_history_messages(history, message),
    ]
    tools = _function_tools(settings.ona_web_search_enabled)
    evidence = [snapshot_json, *(turn.content for turn in history if turn.role == "agent")]
    used_tools: list[str] = []
    proposed: str | None = None
    tokens = [0, 0]
    corrected = False
    client = http or httpx.AsyncClient(timeout=90)

    try:
        for _ in range(MAX_ROUNDS):
            data = await _complete(client, settings, model, messages, tools)
            usage = data.get("usage") or {}
            tokens[0] += int(usage.get("prompt_tokens") or 0)
            tokens[1] += int(usage.get("completion_tokens") or 0)
            reply = ((data.get("choices") or [{}])[0]).get("message") or {}
            calls = reply.get("tool_calls") or []
            if calls:
                messages.append({"role": "assistant", "content": reply.get("content") or "", "tool_calls": calls})
                for call in calls:
                    name = (call.get("function") or {}).get("name") or ""
                    used_tools.append(name)
                    output, action = await _run_groq_tool(settings, session, business_id, call)
                    proposed = action or proposed
                    evidence.append(output)
                    messages.append({"role": "tool", "tool_call_id": call.get("id"), "content": output})
                continue

            answer = (reply.get("content") or "").strip()
            unsupported = ungrounded_figures(answer, evidence)
            if unsupported and not corrected:
                corrected = True
                logger.info("Ona draft had %d ungrounded figure(s); asking for a correction", len(unsupported))
                messages.append({"role": "assistant", "content": answer})
                messages.append({"role": "user", "content": _correction(unsupported)})
                continue
            if unsupported:
                logger.warning("Ona answer still has %d ungrounded figure(s)", len(unsupported))
            return OnaAnswer(
                answer or "I couldn't put an answer together just now. Please try asking another way.",
                _citations(used_tools),
                proposed,
                tokens[0],
                tokens[1],
                used_tools=tuple(dict.fromkeys(used_tools)),
                model=data.get("model") or model,
            )
        raise RuntimeError("Ona exceeded its tool rounds")
    except _GroqError as error:
        if error.status == 429:
            return OnaAnswer("I'm getting too many requests right now. Please wait a moment and try again.", (),
                             error=True, error_code="ONA_RATE_LIMITED")
        if error.status in (401, 403):
            return OnaAnswer("I'm having trouble connecting to my knowledge base. Please check your API configuration.",
                             (), error=True, error_code="ONA_UPSTREAM_AUTH")
        if error.status == 404:
            return OnaAnswer("The service I need isn't available right now. Please try again later.", (),
                             error=True, error_code="ONA_UPSTREAM_NOT_FOUND")
        logger.warning("Ona (Groq) failed: HTTP %s %s", error.status, error.code or "")
    except (httpx.HTTPError, RuntimeError) as error:
        logger.warning("Ona (Groq) failed: %s", type(error).__name__)
    finally:
        if http is None:
            await client.aclose()
    return OnaAnswer("I couldn't check your business data just now. Please try again.", (),
                     error=True, error_code="ONA_UPSTREAM_ERROR")


async def _complete(
    client: httpx.AsyncClient, settings: Settings, model: str, messages: list[dict], tools: list[dict]
) -> dict:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "max_completion_tokens": MAX_OUTPUT_TOKENS,
    }
    if model.startswith("openai/gpt-oss-"):
        body["reasoning_effort"] = "medium"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    # Groq returns 400 tool_use_failed when the model emits a malformed tool
    # call; a second sample usually gets it right.
    for attempt in range(2):
        response = await client.post(settings.groq_api_url, json=body, headers=headers)
        if response.status_code < 400:
            return response.json()
        code = _error_code(response)
        if response.status_code == 400 and code == "tool_use_failed" and attempt == 0:
            continue
        raise _GroqError(response.status_code, code)
    raise _GroqError(400, "tool_use_failed")


def _error_code(response: httpx.Response) -> str | None:
    try:
        return ((response.json() or {}).get("error") or {}).get("code")
    except ValueError:
        return None


async def _run_groq_tool(
    settings: Settings, session: AsyncSession, business_id: UUID, call: dict
) -> tuple[str, str | None]:
    function = call.get("function") or {}
    name = function.get("name") or ""
    try:
        args = json.loads(function.get("arguments") or "{}")
    except json.JSONDecodeError:
        return json.dumps({"error": "The tool arguments were not valid JSON."}), None
    if name == "web_search":
        query = args.get("query") if isinstance(args, dict) else None
        if not isinstance(query, str) or not query.strip():
            return json.dumps({"web_sources": [], "error": "A search query is required."}), None
        sources = await ona.fetch_web_context(settings, query.strip()[:280])
        return json.dumps({"web_sources": sources}, ensure_ascii=False), None
    return await _run_tool(settings, session, business_id, name, args)
