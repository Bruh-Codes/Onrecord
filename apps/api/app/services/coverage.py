import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.business import Account
from app.models.document import Document
from app.models.transaction import Transaction

_HOLE_MIN_DAYS = 7


class _Range:
    __slots__ = ("from_day", "to_day")

    def __init__(self, from_day, to_day):
        self.from_day = from_day
        self.to_day = to_day

    def merge(self, other: "_Range") -> bool:
        """Grow this range to include other if they are contiguous or overlap."""
        if other.from_day <= self.to_day + timedelta(days=1):
            self.from_day = min(self.from_day, other.from_day)
            self.to_day = max(self.to_day, other.to_day)
            return True
        return False


def merged_ranges(periods: list[tuple[date, date]]) -> list[tuple[date, date]]:
    """Merge [start, end] date ranges into contiguous covered spans,
    including ranges that touch (end of one + 1 day == start of next)."""
    spans = sorted(
        (_Range(s, e) for s, e in periods if s is not None and e is not None),
        key=lambda r: (r.from_day, r.to_day),
    )
    if not spans:
        return []
    result: list[_Range] = [spans[0]]
    for span in spans[1:]:
        if not result[-1].merge(span):
            result.append(span)
    return [(r.from_day, r.to_day) for r in result]


def holes_in(ranges: list[tuple[date, date]]) -> list[tuple[date, date]]:
    """Uncovered gaps between merged ranges that are >= 7 days."""
    holes: list[tuple[date, date]] = []
    prev_end: date | None = None
    for start, end in ranges:
        if prev_end is not None:
            gap_start = prev_end + timedelta(days=1)
            gap_end = start - timedelta(days=1)
            if gap_end >= gap_start and (gap_end - gap_start).days + 1 >= _HOLE_MIN_DAYS:
                holes.append((gap_start, gap_end))
        prev_end = end
    return holes


def continuous_months(ranges: list[tuple[date, date]]) -> int:
    """Largest count of complete calendar months covered without a gap,
    measured on the longest merged run."""
    if not ranges:
        return 0
    merged = merged_ranges(ranges)
    if not merged:
        return 0
    longest = max(merged, key=lambda r: (r[1] - r[0]).days)
    start, end = longest
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    return max(months, 0)


async def build_coverage(session: AsyncSession, business_id: uuid.UUID) -> dict:
    """Async coverage computation, used by the API layer."""
    accounts = (await session.scalars(select(Account).where(Account.business_id == business_id))).all()
    docs = (
        await session.scalars(
            select(Document).where(
                Document.business_id == business_id,
                Document.period_start.is_not(None),
                Document.period_end.is_not(None),
                Document.deleted_at.is_(None),
            )
        )
    ).all()
    link_rows = []
    if docs:
        doc_ids = [d.id for d in docs]
        link_rows = (
            await session.execute(
                select(Transaction.document_id, Transaction.account_id).where(Transaction.document_id.in_(doc_ids))
            )
        ).all()
    return _assemble(accounts, docs, link_rows)


def build_coverage_sync(session: Session, business_id: uuid.UUID) -> dict:
    """Sync coverage computation, used by the Celery worker."""
    accounts = session.scalars(select(Account).where(Account.business_id == business_id)).all()
    docs = session.scalars(
        select(Document).where(
            Document.business_id == business_id,
            Document.period_start.is_not(None),
            Document.period_end.is_not(None),
            Document.deleted_at.is_(None),
        )
    ).all()
    link_rows = []
    if docs:
        doc_ids = [d.id for d in docs]
        link_rows = session.execute(
            select(Transaction.document_id, Transaction.account_id).where(Transaction.document_id.in_(doc_ids))
        ).all()
    return _assemble(accounts, docs, link_rows)


def _assemble(accounts, docs, link_rows) -> dict:
    doc_accounts: dict[uuid.UUID, set[uuid.UUID]] = {d.id: set() for d in docs}
    for document_id, account_id in link_rows:
        if document_id in doc_accounts:
            doc_accounts[document_id].add(account_id)

    by_account: dict[uuid.UUID, list[tuple[date, date]]] = {a.id: [] for a in accounts}
    for doc in docs:
        for account_id in doc_accounts.get(doc.id, set()):
            by_account.setdefault(account_id, []).append((doc.period_start, doc.period_end))

    account_coverage = []
    latest_end: date | None = None
    all_ranges: list[tuple[date, date]] = []
    for account in accounts:
        ranges = merged_ranges(by_account.get(account.id, []))
        all_ranges.extend(ranges)
        account_coverage.append(
            {
                "account_id": str(account.id),
                "covered": [{"from": s.isoformat(), "to": e.isoformat()} for s, e in ranges],
                "holes": [{"from": s.isoformat(), "to": e.isoformat()} for s, e in holes_in(ranges)],
            }
        )
        if ranges:
            account_end = max(e for _, e in ranges)
            latest_end = account_end if latest_end is None else max(latest_end, account_end)

    analysis_window_months = 0
    analysis_from = None
    if latest_end is not None:
        analysis_from = _shift_months(date(latest_end.year, latest_end.month, 1), -11)
        analysis_window_months = 12

    return {
        "accounts": account_coverage,
        "analysis_window": {
            "from": analysis_from.isoformat() if analysis_from else None,
            "to": latest_end.isoformat() if latest_end else None,
        },
        "analysis_window_months": analysis_window_months,
        "continuous_months": continuous_months(all_ranges),
    }


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)