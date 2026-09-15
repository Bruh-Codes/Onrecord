"""Web search for Ona (Groq / GPT-OSS has no hosted browsing).

Search runs server-side before the model call. Results are passed as structured
snippets the model must treat as the only allowed external facts.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_PLATFORM_PHRASES = (
    "my readiness",
    "my score",
    "readiness score",
    "open gap",
    "my gap",
    "my document",
    "my upload",
    "my transaction",
    "retry stuck",
    "recompute",
    "refresh readiness",
    "stuck upload",
    "my checklist",
    "my indicator",
    "how many transaction",
    "money in",
    "money out",
    "what is my",
    "show my",
)

_GENERAL_SIGNALS = (
    "how do i",
    "how to",
    "what is",
    "what should",
    "start a business",
    "start business",
    "new business",
    "register",
    "gra",
    "tin",
    "tax",
    "loan",
    "lender",
    "bookkeep",
    "finance",
    "sme",
    "business plan",
    "latest",
    "current",
    "rate",
    "law",
    "requirement",
    "explain",
    "difference between",
    "ghana",
)


@dataclass(frozen=True)
class WebSnippet:
    title: str
    url: str
    snippet: str


def needs_web_search(message: str) -> bool:
    """Whether to fetch web context before calling the LLM."""
    lower = message.lower().strip()
    if not lower:
        return False
    if lower in {"hi", "hello", "hey", "thanks", "thank you", "ok", "okay"}:
        return False
    platform_only = any(p in lower for p in _PLATFORM_PHRASES) and not any(g in lower for g in _GENERAL_SIGNALS)
    if platform_only:
        return False
    if any(g in lower for g in _GENERAL_SIGNALS):
        return True
    return "?" in message or len(lower.split()) > 10


def asks_about_platform_data(message: str) -> bool:
    lower = message.lower()
    return any(p in lower for p in _PLATFORM_PHRASES)


def search_queries_for(message: str) -> list[str]:
    base = " ".join(message.split())[:280]
    queries = [base]
    if "ghana" not in base.lower():
        queries.append(f"{base} Ghana SME")
    return queries[:2]


async def fetch_web_context(settings: Settings, message: str) -> list[dict[str, str]]:
    if not settings.ona_web_search_enabled:
        return []
    snippets: list[WebSnippet] = []
    for query in search_queries_for(message):
        try:
            batch = await _search_once(settings, query)
        except httpx.HTTPError as exc:
            logger.warning("Ona web search failed for query: %s", type(exc).__name__)
            continue
        for item in batch:
            if not any(s.url == item.url for s in snippets):
                snippets.append(item)
        if len(snippets) >= settings.ona_max_web_results:
            break
    snippets = snippets[: settings.ona_max_web_results]
    return [{"title": s.title, "url": s.url, "snippet": s.snippet} for s in snippets]


async def _search_once(settings: Settings, query: str) -> list[WebSnippet]:
    if settings.tavily_api_key:
        return await _tavily(settings.tavily_api_key, query, settings.ona_max_web_results)
    if settings.brave_search_api_key:
        return await _brave(settings.brave_search_api_key, query, settings.ona_max_web_results)
    return await _duckduckgo_instant(query, settings.ona_max_web_results)


async def _tavily(api_key: str, query: str, max_results: int) -> list[WebSnippet]:
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "search_depth": "basic",
                "include_answer": False,
            },
        )
        response.raise_for_status()
        body = response.json()
    out: list[WebSnippet] = []
    for row in body.get("results") or []:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        out.append(
            WebSnippet(
                title=str(row.get("title") or url)[:200],
                url=url[:500],
                snippet=str(row.get("content") or row.get("snippet") or "")[:800],
            )
        )
    return out


async def _brave(api_key: str, query: str, max_results: int) -> list[WebSnippet]:
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": max_results},
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
        )
        response.raise_for_status()
        body = response.json()
    out: list[WebSnippet] = []
    for row in (body.get("web") or {}).get("results") or []:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        desc = str(row.get("description") or "")
        out.append(
            WebSnippet(
                title=str(row.get("title") or url)[:200],
                url=url[:500],
                snippet=desc[:800],
            )
        )
    return out


async def _duckduckgo_instant(query: str, max_results: int) -> list[WebSnippet]:
    """Free fallback when no search API key is configured (limited coverage)."""
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        response = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_redirect": 1, "no_html": 1},
        )
        response.raise_for_status()
        body = response.json()
    out: list[WebSnippet] = []
    abstract = str(body.get("AbstractText") or "").strip()
    abstract_url = str(body.get("AbstractURL") or "").strip()
    if abstract and abstract_url:
        out.append(
            WebSnippet(
                title=str(body.get("Heading") or "Summary")[:200],
                url=abstract_url[:500],
                snippet=abstract[:800],
            )
        )
    for topic in body.get("RelatedTopics") or []:
        if len(out) >= max_results:
            break
        parsed = _ddg_related(topic)
        if parsed is not None:
            out.append(parsed)
    if len(out) < max_results:
        html_hits = await _duckduckgo_html_lite(client=None, query=query, limit=max_results - len(out))
        for hit in html_hits:
            if not any(s.url == hit.url for s in out):
                out.append(hit)
    return out[:max_results]


def _ddg_related(topic: Any) -> WebSnippet | None:
    if not isinstance(topic, dict):
        return None
    if "Topics" in topic:
        return None
    text = str(topic.get("Text") or "").strip()
    url = str(topic.get("FirstURL") or "").strip()
    if not text or not url:
        return None
    title = text.split(" - ", 1)[0][:200]
    return WebSnippet(title=title, url=url[:500], snippet=text[:800])


async def _duckduckgo_html_lite(*, client: httpx.AsyncClient | None, query: str, limit: int) -> list[WebSnippet]:
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=20, follow_redirects=True)
    try:
        assert client is not None
        response = await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": "Onrecord-Ona/1.0 (business assistant)"},
        )
        response.raise_for_status()
        html = response.text
    finally:
        if own_client:
            await client.aclose()
    links = re.findall(
        r'class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>',
        html,
        flags=re.IGNORECASE,
    )
    snippets_raw = re.findall(r'class="result__snippet"[^>]*>([^<]+)<', html, flags=re.IGNORECASE)
    out: list[WebSnippet] = []
    for index, (url, title) in enumerate(links[:limit]):
        snippet = snippets_raw[index] if index < len(snippets_raw) else ""
        clean_url = url.replace("&amp;", "&")
        out.append(
            WebSnippet(
                title=_strip_tags(title)[:200],
                url=clean_url[:500],
                snippet=_strip_tags(snippet)[:800],
            )
        )
    return out


def _strip_tags(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()
