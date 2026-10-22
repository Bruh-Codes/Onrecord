"""Read-only, business-scoped tools Ona calls to answer from the owner's data.

Every figure a tool returns is computed here from stored transactions, so the
model quotes numbers rather than producing them (INV-3). Money is returned both
as integer pesewas and as a display string the model can repeat verbatim.
"""

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Select, String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.enums import Direction
from app.models.transaction import Transaction

MAX_ROWS = 50
_NULLABLE_DATE = {"type": ["string", "null"], "description": "YYYY-MM-DD, or null for no limit"}


def ghs(pesewas: int) -> str:
    sign = "-" if pesewas < 0 else ""
    cedis, rest = divmod(abs(int(pesewas)), 100)
    return f"{sign}GH¢{cedis:,}.{rest:02d}"


def percent(part: int, whole: int) -> str | None:
    if not whole:
        return None
    return f"{round(part * 100 / whole)}%"


def _tool(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOL_DEFINITIONS = [
    _tool(
        "get_business_health",
        "The complete verified picture: business profile, accounts, all-time money in/out, spending by "
        "category, indicators, documents, coverage, readiness score and open gaps. Call this first for "
        "broad questions such as 'how is my business doing'.",
        {},
    ),
    _tool(
        "get_cash_flow",
        "Money in, money out and net per month or week, oldest first, with the change from the previous "
        "period. Use for trends, best/worst months, seasonality and 'how much did I make in March'.",
        {
            "group_by": {"type": "string", "enum": ["month", "week"]},
            "start_date": _NULLABLE_DATE,
            "end_date": _NULLABLE_DATE,
        },
    ),
    _tool(
        "get_top_counterparties",
        "Rank who the business receives money from (customers, buyers) or pays (suppliers, workers) by "
        "total amount, with counts and share of the total.",
        {
            "direction": {"type": "string", "enum": ["in", "out"]},
            "start_date": _NULLABLE_DATE,
            "end_date": _NULLABLE_DATE,
            "limit": {"type": "integer", "description": "1-20"},
        },
    ),
    _tool(
        "get_category_breakdown",
        "Totals by category (sales, stock & inputs, running costs, loans, owner, tax, unclassified) for "
        "money in and money out, optionally for a date range.",
        {"start_date": _NULLABLE_DATE, "end_date": _NULLABLE_DATE},
    ),
    _tool(
        "search_transactions",
        "Find individual transactions by keyword (matches description, counterparty and reference), "
        "direction, category, date range and amount range. Returns the total count and sum of every "
        "match plus up to 50 rows.",
        {
            "query": {"type": ["string", "null"]},
            "direction": {"type": ["string", "null"], "enum": ["in", "out", None]},
            "category": {"type": ["string", "null"]},
            "start_date": _NULLABLE_DATE,
            "end_date": _NULLABLE_DATE,
            "min_amount_ghs": {"type": ["number", "null"]},
            "max_amount_ghs": {"type": ["number", "null"]},
            "sort": {"type": "string", "enum": ["newest", "oldest", "largest"]},
            "limit": {"type": "integer", "description": "1-50"},
        },
    ),
    _tool(
        "compare_periods",
        "Compare two date ranges: money in, money out, net, transaction count and the change between them, "
        "plus the categories that moved most.",
        {
            "first_start": {"type": "string"},
            "first_end": {"type": "string"},
            "second_start": {"type": "string"},
            "second_end": {"type": "string"},
        },
    ),
    _tool(
        "list_documents",
        "The owner's uploaded documents with type, status, period, how many transactions each produced and "
        "whether rows are waiting for the owner to check them.",
        {},
    ),
    _tool(
        "get_readiness_gaps",
        "Readiness score, open gaps and missing checklist documents a lender would ask for.",
        {},
    ),
    _tool(
        "propose_action",
        "Offer the owner a button for one of two actions. Nothing runs until they press it. Only use when "
        "they asked to refresh readiness, or asked to retry uploads that are stuck.",
        {"action": {"type": "string", "enum": ["recompute_readiness", "retry_stuck_documents"]}},
    ),
]

# Which snapshot sections a tool's answer draws on, for the reply's citations.
TOOL_CITATIONS = {
    "get_business_health": ("business", "transactions", "indicators", "documents", "coverage", "readiness_score"),
    "get_cash_flow": ("transactions",),
    "get_top_counterparties": ("transactions",),
    "get_category_breakdown": ("transactions",),
    "search_transactions": ("transactions",),
    "compare_periods": ("transactions",),
    "list_documents": ("documents",),
    "get_readiness_gaps": ("readiness_score", "open_gaps", "gap_details", "checklist"),
}


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _active(business_id: UUID) -> list:
    return [Transaction.business_id == business_id, Document.deleted_at.is_(None)]


def _not_internal():
    return or_(Transaction.flags["internal_transfer"].astext.is_(None), Transaction.flags["internal_transfer"].astext != "true")


def _in_range(start: date | None, end: date | None) -> list:
    conditions = []
    if start:
        conditions.append(Transaction.occurred_on >= start)
    if end:
        conditions.append(Transaction.occurred_on <= end)
    return conditions


def _sum(direction: Direction):
    return func.coalesce(func.sum(case((Transaction.direction == direction, Transaction.amount_pesewas), else_=0)), 0)


def _base(*columns) -> Select:
    return select(*columns).select_from(Transaction).join(Document, Transaction.document_id == Document.id)


async def cash_flow(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    unit = "week" if args.get("group_by") == "week" else "month"
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    bucket = func.date_trunc(unit, Transaction.occurred_on).label("bucket")
    rows = (await session.execute(
        _base(bucket, _sum(Direction.IN), _sum(Direction.OUT), func.count())
        .where(*_active(business_id), _not_internal(), *_in_range(start, end))
        .group_by(bucket).order_by(bucket)
    )).all()
    periods, previous_net = [], None
    for bucket_start, money_in, money_out, count in rows:
        net = int(money_in) - int(money_out)
        periods.append({
            "period": bucket_start.date().isoformat()[: 7 if unit == "month" else 10],
            "money_in": ghs(money_in), "money_out": ghs(money_out), "net": ghs(net),
            "money_in_pesewas": int(money_in), "money_out_pesewas": int(money_out), "net_pesewas": net,
            "transactions": int(count),
            "net_change_from_previous": None if previous_net is None else ghs(net - previous_net),
        })
        previous_net = net
    total_in = sum(p["money_in_pesewas"] for p in periods)
    total_out = sum(p["money_out_pesewas"] for p in periods)
    return {
        "group_by": unit,
        "periods": periods,
        "totals": {"money_in": ghs(total_in), "money_out": ghs(total_out), "net": ghs(total_in - total_out)},
        "best_period": max(periods, key=lambda p: p["net_pesewas"])["period"] if periods else None,
        "worst_period": min(periods, key=lambda p: p["net_pesewas"])["period"] if periods else None,
        "note": "Transfers between the business's own accounts are excluded.",
    }


async def top_counterparties(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    direction = Direction.OUT if args.get("direction") == "out" else Direction.IN
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    limit = min(max(int(args.get("limit") or 10), 1), 20)
    name = func.coalesce(Transaction.flags["counterparty"].astext, Transaction.description, "Unnamed").label("name")
    filters = [*_active(business_id), _not_internal(), Transaction.direction == direction, *_in_range(start, end)]
    total = int(await session.scalar(_base(func.coalesce(func.sum(Transaction.amount_pesewas), 0)).where(*filters)) or 0)
    rows = (await session.execute(
        _base(name, func.count(), func.sum(Transaction.amount_pesewas), func.max(Transaction.occurred_on))
        .where(*filters).group_by(name).order_by(func.sum(Transaction.amount_pesewas).desc()).limit(limit)
    )).all()
    return {
        "direction": direction.value,
        "total": ghs(total),
        "counterparties": [
            {"name": label, "transactions": int(count), "amount": ghs(amount), "amount_pesewas": int(amount),
             "share_of_total": percent(int(amount), total), "last_on": last_on.isoformat()}
            for label, count, amount, last_on in rows
        ],
        "note": "Counterparties come from the statement narration; rows without a name are grouped by description.",
    }


async def category_breakdown(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    category = func.coalesce(Transaction.category_l1, "unclassified").label("category")
    rows = (await session.execute(
        _base(Transaction.direction, category, func.count(), func.sum(Transaction.amount_pesewas))
        .where(*_active(business_id), *_in_range(start, end))
        .group_by(Transaction.direction, category).order_by(func.sum(Transaction.amount_pesewas).desc())
    )).all()
    result: dict[str, Any] = {"money_in": [], "money_out": []}
    totals = {"in": 0, "out": 0}
    for direction, _, _, amount in rows:
        totals[direction.value] += int(amount)
    for direction, label, count, amount in rows:
        result["money_in" if direction == Direction.IN else "money_out"].append({
            "category": label, "transactions": int(count), "amount": ghs(amount), "amount_pesewas": int(amount),
            "share": percent(int(amount), totals[direction.value]),
        })
    result["total_in"], result["total_out"] = ghs(totals["in"]), ghs(totals["out"])
    return result


def transaction_filters(business_id: UUID, args: dict) -> list:
    """Filters shared by Ona's search tool and the money page's transaction list."""
    filters = [*_active(business_id)]
    query = args.get("query")
    if isinstance(query, str) and query.strip():
        pattern = f"%{query.strip()[:80]}%"
        filters.append(or_(
            Transaction.description.ilike(pattern),
            Transaction.flags["counterparty"].astext.ilike(pattern),
            Transaction.provider_reference.ilike(pattern),
            cast(Transaction.flags["reference"].astext, String).ilike(pattern),
        ))
    if args.get("direction") in ("in", "out"):
        filters.append(Transaction.direction == Direction(args["direction"]))
    category = args.get("category")
    if isinstance(category, str) and category.strip():
        value = category.strip().lower()
        filters.append(Transaction.category_l1.is_(None) if value == "unclassified" else Transaction.category_l1.ilike(f"%{value[:40]}%"))
    filters.extend(_in_range(_parse_date(args.get("start_date")), _parse_date(args.get("end_date"))))
    for key, op in (("min_amount_ghs", "ge"), ("max_amount_ghs", "le")):
        value = args.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            column = Transaction.amount_pesewas
            filters.append(column >= int(value * 100) if op == "ge" else column <= int(value * 100))
    return filters


async def find_transactions(
    session: AsyncSession, business_id: UUID, args: dict, *, offset: int = 0, limit: int = 25,
) -> tuple[dict, list[Transaction]]:
    filters = transaction_filters(business_id, args)
    count, money_in, money_out = (await session.execute(
        _base(func.count(), _sum(Direction.IN), _sum(Direction.OUT)).where(and_(*filters))
    )).one()
    order = {
        "oldest": (Transaction.occurred_on.asc(), Transaction.id.asc()),
        "largest": (Transaction.amount_pesewas.desc(), Transaction.id.asc()),
    }.get(args.get("sort"), (Transaction.occurred_on.desc(), Transaction.id.desc()))
    rows = (await session.scalars(
        select(Transaction).join(Document, Transaction.document_id == Document.id)
        .where(and_(*filters)).order_by(*order).offset(max(offset, 0)).limit(limit)
    )).all()
    totals = {"matches": int(count), "money_in_pesewas": int(money_in), "money_out_pesewas": int(money_out)}
    return totals, list(rows)


async def search_transactions(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    limit = min(max(int(args.get("limit") or 25), 1), MAX_ROWS)
    totals, rows = await find_transactions(session, business_id, args, limit=limit)
    return {
        "matches": totals["matches"],
        "money_in_total": ghs(totals["money_in_pesewas"]),
        "money_out_total": ghs(totals["money_out_pesewas"]),
        "showing": len(rows),
        "transactions": [
            {
                "date": row.occurred_on.isoformat(),
                "direction": row.direction.value,
                "amount": ghs(row.amount_pesewas),
                "amount_pesewas": row.amount_pesewas,
                "fees": ghs(row.fee_pesewas + row.levy_pesewas) if (row.fee_pesewas or row.levy_pesewas) else None,
                "category": row.category_l1 or "unclassified",
                "counterparty": (row.flags or {}).get("counterparty"),
                "description": row.description,
            }
            for row in rows
        ],
    }


async def compare_periods(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    ranges = []
    for prefix in ("first", "second"):
        start, end = _parse_date(args.get(f"{prefix}_start")), _parse_date(args.get(f"{prefix}_end"))
        if start is None or end is None:
            return {"error": f"{prefix}_start and {prefix}_end must be YYYY-MM-DD dates."}
        ranges.append((start, end))
    summaries, categories = [], []
    for start, end in ranges:
        money_in, money_out, count = (await session.execute(
            _base(_sum(Direction.IN), _sum(Direction.OUT), func.count())
            .where(*_active(business_id), _not_internal(), *_in_range(start, end))
        )).one()
        summaries.append((int(money_in), int(money_out), int(count)))
        category = func.coalesce(Transaction.category_l1, "unclassified")
        rows = (await session.execute(
            _base(Transaction.direction, category, func.sum(Transaction.amount_pesewas))
            .where(*_active(business_id), *_in_range(start, end)).group_by(Transaction.direction, category)
        )).all()
        categories.append({(direction.value, label): int(amount) for direction, label, amount in rows})

    def describe(index: int) -> dict:
        (start, end), (money_in, money_out, count) = ranges[index], summaries[index]
        return {"from": start.isoformat(), "to": end.isoformat(), "money_in": ghs(money_in),
                "money_out": ghs(money_out), "net": ghs(money_in - money_out), "transactions": count}

    (in_a, out_a, _), (in_b, out_b, _) = summaries
    keys = set(categories[0]) | set(categories[1])
    movers = sorted(keys, key=lambda key: abs(categories[1].get(key, 0) - categories[0].get(key, 0)), reverse=True)[:6]
    return {
        "first": describe(0),
        "second": describe(1),
        "change": {
            "money_in": ghs(in_b - in_a), "money_in_percent": percent(in_b - in_a, in_a),
            "money_out": ghs(out_b - out_a), "money_out_percent": percent(out_b - out_a, out_a),
            "net": ghs((in_b - out_b) - (in_a - out_a)),
        },
        "biggest_category_changes": [
            {"direction": direction, "category": label, "first": ghs(categories[0].get((direction, label), 0)),
             "second": ghs(categories[1].get((direction, label), 0)),
             "change": ghs(categories[1].get((direction, label), 0) - categories[0].get((direction, label), 0))}
            for direction, label in movers
        ],
    }


HANDLERS = {
    "get_cash_flow": cash_flow,
    "get_top_counterparties": top_counterparties,
    "get_category_breakdown": category_breakdown,
    "search_transactions": search_transactions,
    "compare_periods": compare_periods,
}
