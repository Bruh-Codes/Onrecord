"""Claude client factory.

The key lives only in the API/worker environment (Agent.md §7). Call sites ask
for a client and treat ``None`` as "Claude is not configured" so every caller
keeps a non-AI fallback.
"""

from functools import lru_cache

import anthropic

from app.config import get_settings

# Server-side refusal fallback: a declined request is retried on a model the
# API picks for the refusal category, inside the same call.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


@lru_cache
def _client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key, timeout=600.0, max_retries=2)


@lru_cache
def _async_client(api_key: str) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=120.0, max_retries=2)


def get_claude_client() -> anthropic.Anthropic | None:
    key = get_settings().anthropic_api_key
    return _client(key) if key else None


def get_async_claude_client() -> anthropic.AsyncAnthropic | None:
    key = get_settings().anthropic_api_key
    return _async_client(key) if key else None
