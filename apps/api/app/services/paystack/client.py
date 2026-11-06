"""A read-only Paystack client.

Only GET requests exist here, on purpose: OnRecord lists payments, refunds and
payouts and never creates, refunds or transfers anything. Keep it that way.
Docs: https://paystack.com/docs/api/
"""

from collections.abc import Iterator
from datetime import UTC, datetime

import httpx

from app.config import get_settings

PER_PAGE = 100
# A guard against a runaway loop; 200 pages is 20,000 records in one sync.
MAX_PAGES = 200


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class PaystackError(Exception):
    """code is PAYSTACK_KEY_REJECTED (owner must act) or PAYSTACK_UNREACHABLE (try later)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


class PaystackClient:
    def __init__(self, secret_key: str, *, transport: httpx.BaseTransport | None = None):
        self._http = httpx.Client(
            base_url=get_settings().paystack_api_url,
            headers={"Authorization": f"Bearer {secret_key}", "Accept": "application/json"},
            timeout=httpx.Timeout(20.0, connect=10.0),
            transport=transport,
        )

    def __enter__(self) -> "PaystackClient":
        return self

    def __exit__(self, *_) -> None:
        self._http.close()

    def _get(self, path: str, params: dict) -> dict:
        try:
            response = self._http.get(path, params=params)
        except httpx.HTTPError as error:
            raise PaystackError("PAYSTACK_UNREACHABLE", "Couldn't reach Paystack. OnRecord will try again shortly.") from error
        if response.status_code in (401, 403):
            raise PaystackError(
                "PAYSTACK_KEY_REJECTED",
                "Paystack didn't accept this key. It may have been changed. Paste your current secret key to keep syncing.",
            )
        if response.status_code >= 400:
            raise PaystackError("PAYSTACK_UNREACHABLE", f"Paystack answered {response.status_code}. OnRecord will try again shortly.")
        try:
            return response.json()
        except ValueError as error:
            raise PaystackError("PAYSTACK_UNREACHABLE", "Paystack sent an unreadable answer. OnRecord will try again shortly.") from error

    def _pages(self, path: str, params: dict) -> Iterator[dict]:
        for page in range(1, MAX_PAGES + 1):
            body = self._get(path, {**params, "perPage": PER_PAGE, "page": page})
            items = body.get("data") or []
            yield from items
            meta = body.get("meta") or {}
            page_count = meta.get("pageCount")
            if len(items) < PER_PAGE or (page_count is not None and page >= int(page_count)):
                return

    def check_key(self) -> None:
        """One cheap read that fails with PAYSTACK_KEY_REJECTED for a bad key."""
        self._get("/transaction", {"perPage": 1})

    def transactions(self, since: datetime, until: datetime) -> Iterator[dict]:
        return self._pages("/transaction", {"status": "success", "from": _stamp(since), "to": _stamp(until)})

    def refunds(self, since: datetime, until: datetime) -> Iterator[dict]:
        return self._pages("/refund", {"from": _stamp(since), "to": _stamp(until)})

    def settlements(self, since: datetime, until: datetime) -> Iterator[dict]:
        return self._pages("/settlement", {"from": _stamp(since), "to": _stamp(until)})
