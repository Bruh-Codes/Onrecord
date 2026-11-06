"""Read-only, business-scoped tools Ona calls to answer from the owner's data.

Every figure a tool returns is computed here from stored transactions, so the
model quotes numbers rather than producing them (INV-3). Money is returned both
as integer pesewas and as a display string the model can repeat verbatim.
"""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import Select, String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.enums import Direction, DocStatus
from app.models.transaction import Transaction

MAX_ROWS = 50

# Owner-facing names for the stored categories, so Ona never repeats codes
# such as "cogs" or "owner" to the owner.
CATEGORY_LABELS = {
    "revenue": "Sales",
    "cogs": "Stock and materials",
    "opex": "Running costs",
    "tax": "Tax",
    "financing_in": "Loan received",
    "financing_out": "Loan repayment",
    "owner": "Personal (owner's own money)",
    "internal": "Moves between your own accounts",
    "unclassified": "Not sorted yet",
}
# Which side of the business/personal split each category falls on.
_SPLIT = {
    "revenue": "business", "cogs": "business", "opex": "business", "tax": "business",
    "financing_in": "business", "financing_out": "business",
    "owner": "personal", "internal": "own_accounts",
}
_LABEL_TO_CATEGORY = {label.lower(): code for code, label in CATEGORY_LABELS.items()} | {
    "personal": "owner", "sales": "revenue", "stock": "cogs", "running costs": "opex",
}
DOC_TYPE_LABELS = {
    "momo_statement": "MoMo statement",
    "momo_merchant_statement": "MoMo merchant statement",
    "bank_statement": "Bank statement",
    "invoice_issued": "Invoice you sent",
    "invoice_received": "Bill you received",
    "receipt": "Receipt",
    "informal_ledger": "Cash book or sales book",
    "registration_cert": "Business registration certificate",
    "tax_doc": "TIN certificate or Ghana Card",
    "tenancy_agreement": "Tenancy agreement",
    "stock_list": "Stock list",
    "financial_statement": "Financial statement",
    "cashflow_projection": "Cash flow projection",
    "id_document": "ID document",
    "other": "Other document",
}
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
        "Sales, money in, money out and net per month or week, oldest first, with the change from the "
        "previous period and the months with the most and least sales. Use for trends, best/worst months, "
        "seasonality and 'how much did I make in March'.",
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
        "money in and money out, optionally for a date range. Quote the label field to the owner.",
        {"start_date": _NULLABLE_DATE, "end_date": _NULLABLE_DATE},
    ),
    _tool(
        "search_transactions",
        "Find individual transactions by keyword (matches description, counterparty and reference), "
        "direction, category, date range and amount range. Returns the total count and sum of every "
        "match plus up to 50 rows. category is one of: revenue (sales), cogs (stock and materials), "
        "opex (running costs), owner (personal money), internal (moves between own accounts), tax, "
        "financing_in, financing_out, unclassified.",
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
        "get_farm_breakdown",
        "Money in, money out and what was left for each product, service or crop and each season or "
        "batch the owner tagged (for example Tomatoes, 2026 main season or Phone repairs, Christmas), "
        "plus how much is not tagged. Use for 'how did my tomatoes do', 'which line of my business "
        "makes the most' or 'which season was best'.",
        {"start_date": _NULLABLE_DATE, "end_date": _NULLABLE_DATE},
    ),
    _tool(
        "get_business_vs_personal",
        "Split money in and money out into business (sales, stock, running costs, tax, loans), personal "
        "(the owner's own money: family transfers, school fees, cash taken out for themself) and moves "
        "between the owner's own accounts, with each side's share and the biggest personal payments. Use "
        "for 'how much was business and how much was personal' or 'am I mixing personal money in'.",
        {"start_date": _NULLABLE_DATE, "end_date": _NULLABLE_DATE},
    ),
    _tool(
        "get_statement_summary",
        "What one uploaded statement or record shows: its type, the dates it covers, how many rows were "
        "read, money in and out, business vs personal, the busiest month and the biggest payments in and "
        "out. Use for 'what did my MoMo statement show' or questions about one upload. document is part "
        "of the file name, or null for the most recent statement.",
        {"document": {"type": ["string", "null"]}},
    ),
    _tool(
        "get_business_patterns",
        "Patterns for business advice: sales by day of the week, how much sales lean on the top 3 "
        "customers, how many customers came back in 3 or more months, the typical sale, and which costs "
        "(by who was paid) grew in the last 3 months against the 3 before. Use for 'what can I "
        "do better', 'where am I wasting money', 'what are my slow days' or any request for insights. "
        "Also returns the biggest costs by who was paid, with each one's share of all costs.",
        {},
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
    "get_farm_breakdown": ("transactions",),
    "compare_periods": ("transactions",),
    "get_business_vs_personal": ("transactions",),
    "get_business_patterns": ("transactions",),
    "get_statement_summary": ("documents", "transactions"),
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


EXCLUDED_FLAGS = ("duplicate", "internal_transfer", "fx", "reversal")


def _analysed() -> list:
    """Same exclusions as the readiness analytics (s7_analyse.filter_transactions)."""
    return [
        or_(Transaction.flags[flag].astext.is_(None), Transaction.flags[flag].astext != "true")
        for flag in EXCLUDED_FLAGS
    ]


def _in_range(start: date | None, end: date | None) -> list:
    conditions = []
    if start:
        conditions.append(Transaction.occurred_on >= start)
    if end:
        conditions.append(Transaction.occurred_on <= end)
    return conditions


def _tagged(args: dict) -> list:
    """Narrow to one crop/animal and/or season. "untagged" picks rows with no tag."""
    conditions = []
    for key, column in (("farm_activity", Transaction.farm_activity), ("season", Transaction.season)):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            conditions.append(column.is_(None) if value == "untagged" else column == value.strip())
    return conditions


def _sum(direction: Direction):
    return func.coalesce(func.sum(case((Transaction.direction == direction, Transaction.amount_pesewas), else_=0)), 0)


def _base(*columns) -> Select:
    return select(*columns).select_from(Transaction).join(Document, Transaction.document_id == Document.id)


async def cash_flow(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    unit = "week" if args.get("group_by") == "week" else "month"
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    bucket = func.date_trunc(unit, Transaction.occurred_on).label("bucket")
    sales = func.coalesce(func.sum(case(
        (and_(Transaction.direction == Direction.IN, Transaction.category_l1 == "revenue"), Transaction.amount_pesewas),
        else_=0)), 0)
    rows = (await session.execute(
        _base(bucket, _sum(Direction.IN), _sum(Direction.OUT), func.count(), sales)
        .where(*_active(business_id), *_analysed(), *_in_range(start, end), *_tagged(args))
        .group_by(bucket).order_by(bucket)
    )).all()
    periods, previous_net = [], None
    for bucket_start, money_in, money_out, count, sales_pesewas in rows:
        net = int(money_in) - int(money_out)
        periods.append({
            "period": bucket_start.date().isoformat()[: 7 if unit == "month" else 10],
            "sales": ghs(sales_pesewas), "sales_pesewas": int(sales_pesewas),
            "money_in": ghs(money_in), "money_out": ghs(money_out), "net": ghs(net),
            "money_in_pesewas": int(money_in), "money_out_pesewas": int(money_out), "net_pesewas": net,
            "transactions": int(count),
            "net_change_from_previous": None if previous_net is None else ghs(net - previous_net),
        })
        previous_net = net
    total_in = sum(p["money_in_pesewas"] for p in periods)
    total_out = sum(p["money_out_pesewas"] for p in periods)
    total_sales = sum(p["sales_pesewas"] for p in periods)
    return {
        "group_by": unit,
        "periods": periods,
        "totals": {"sales": ghs(total_sales), "money_in": ghs(total_in), "money_out": ghs(total_out), "net": ghs(total_in - total_out)},
        "best_period": max(periods, key=lambda p: p["net_pesewas"])["period"] if periods else None,
        "worst_period": min(periods, key=lambda p: p["net_pesewas"])["period"] if periods else None,
        "most_sales_period": max(periods, key=lambda p: p["sales_pesewas"])["period"] if periods else None,
        "least_sales_period": min(periods, key=lambda p: p["sales_pesewas"])["period"] if periods else None,
        "note": "best_period and worst_period rank by net (money in minus money out); most_sales_period ranks "
                "by sales (money in from customers only). Net includes personal money and is not profit. Duplicates, FX and reversals are excluded.",
    }


async def top_counterparties(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    direction = Direction.OUT if args.get("direction") == "out" else Direction.IN
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    limit = min(max(int(args.get("limit") or 10), 1), 20)
    name = func.coalesce(Transaction.flags["counterparty"].astext, Transaction.description, "Unnamed").label("name")
    filters = [*_active(business_id), *_analysed(), Transaction.direction == direction, *_in_range(start, end), *_tagged(args)]
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
        .where(*_active(business_id), *_analysed(), *_in_range(start, end), *_tagged(args))
        .group_by(Transaction.direction, category).order_by(func.sum(Transaction.amount_pesewas).desc())
    )).all()
    result: dict[str, Any] = {"money_in": [], "money_out": []}
    totals = {"in": 0, "out": 0}
    for direction, _, _, amount in rows:
        totals[direction.value] += int(amount)
    for direction, label, count, amount in rows:
        result["money_in" if direction == Direction.IN else "money_out"].append({
            "category": label, "label": CATEGORY_LABELS.get(label, label), "transactions": int(count),
            "amount": ghs(amount), "amount_pesewas": int(amount), "share": percent(int(amount), totals[direction.value]),
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
        value = _LABEL_TO_CATEGORY.get(value, value)
        filters.append(Transaction.category_l1.is_(None) if value == "unclassified" else Transaction.category_l1.ilike(f"%{value[:40]}%"))
    filters.extend(_in_range(_parse_date(args.get("start_date")), _parse_date(args.get("end_date"))))
    filters.extend(_tagged(args))
    for key, op in (("min_amount_ghs", "ge"), ("max_amount_ghs", "le")):
        value = args.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            pesewas = int((Decimal(str(value)) * 100).to_integral_value(ROUND_HALF_UP))
            column = Transaction.amount_pesewas
            filters.append(column >= pesewas if op == "ge" else column <= pesewas)
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
                "category": CATEGORY_LABELS.get(row.category_l1 or "unclassified", row.category_l1),
                "counterparty": (row.flags or {}).get("counterparty"),
                "description": row.description,
                "product_or_service": row.farm_activity,
                "season": row.season,
                "typed_in_by_owner": bool((row.flags or {}).get("hand_entered")),
            }
            for row in rows
        ],
    }


async def farm_breakdown(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    typed = func.coalesce(func.sum(case((Transaction.flags["hand_entered"].astext == "true", 1), else_=0)), 0)
    rows = (await session.execute(
        _base(Transaction.farm_activity, Transaction.season, _sum(Direction.IN), _sum(Direction.OUT), func.count(),
              typed, func.min(Transaction.occurred_on), func.max(Transaction.occurred_on))
        .where(*_active(business_id), *_analysed(), *_in_range(start, end))
        .group_by(Transaction.farm_activity, Transaction.season)
    )).all()
    groups, untagged = [], {"money_in_pesewas": 0, "money_out_pesewas": 0, "transactions": 0}
    for activity, season, money_in, money_out, count, typed_count, first_on, last_on in rows:
        if activity is None and season is None:
            untagged = {"money_in_pesewas": int(money_in), "money_out_pesewas": int(money_out), "transactions": int(count)}
            continue
        groups.append({
            "farm_activity": activity, "season": season,
            "money_in": ghs(money_in), "money_out": ghs(money_out), "left_over": ghs(int(money_in) - int(money_out)),
            "money_in_pesewas": int(money_in), "money_out_pesewas": int(money_out),
            "left_over_pesewas": int(money_in) - int(money_out), "transactions": int(count),
            "typed_in_by_owner": int(typed_count),
            "first_on": first_on.isoformat(), "last_on": last_on.isoformat(),
        })
    groups.sort(key=lambda g: (g["last_on"], g["money_in_pesewas"]), reverse=True)
    return {
        "groups": groups,
        "untagged": {**untagged, "money_in": ghs(untagged["money_in_pesewas"]), "money_out": ghs(untagged["money_out_pesewas"])},
        "note": "Left over is money in minus money out for that tag. It is not profit: "
                "it leaves out unpaid bills, stock still on hand and costs that were not tagged.",
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
            .where(*_active(business_id), *_analysed(), *_in_range(start, end))
        )).one()
        summaries.append((int(money_in), int(money_out), int(count)))
        category = func.coalesce(Transaction.category_l1, "unclassified")
        rows = (await session.execute(
            _base(Transaction.direction, category, func.sum(Transaction.amount_pesewas))
            .where(*_active(business_id), *_analysed(), *_in_range(start, end)).group_by(Transaction.direction, category)
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
            {"direction": direction, "category": CATEGORY_LABELS.get(label, label), "first": ghs(categories[0].get((direction, label), 0)),
             "second": ghs(categories[1].get((direction, label), 0)),
             "change": ghs(categories[1].get((direction, label), 0) - categories[0].get((direction, label), 0))}
            for direction, label in movers
        ],
    }


async def _split(session: AsyncSession, filters: list) -> dict:
    """Business / personal / own-account totals for the rows matching filters."""
    category = func.coalesce(Transaction.category_l1, "unclassified")
    rows = (await session.execute(
        _base(Transaction.direction, category, func.count(), func.sum(Transaction.amount_pesewas))
        .where(*filters).group_by(Transaction.direction, category)
    )).all()
    sides = {side: {"in": 0, "out": 0, "count": 0} for side in ("business", "personal", "own_accounts", "not_sorted")}
    for direction, label, count, amount in rows:
        side = sides[_SPLIT.get(label, "not_sorted")]
        side[direction.value] += int(amount)
        side["count"] += int(count)
    total_in = sum(side["in"] for side in sides.values())
    total_out = sum(side["out"] for side in sides.values())
    return {
        name: {
            "money_in": ghs(side["in"]), "money_out": ghs(side["out"]), "transactions": side["count"],
            "share_of_money_in": percent(side["in"], total_in), "share_of_money_out": percent(side["out"], total_out),
        }
        for name, side in sides.items() if side["count"]
    } | {"total_money_in": ghs(total_in), "total_money_out": ghs(total_out)}


async def business_vs_personal(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    start, end = _parse_date(args.get("start_date")), _parse_date(args.get("end_date"))
    filters = [*_active(business_id), *_analysed(), *_in_range(start, end)]
    split = await _split(session, filters)
    name = func.coalesce(Transaction.flags["counterparty"].astext, Transaction.description, "Unnamed")
    personal = []
    for direction in (Direction.OUT, Direction.IN):
        rows = (await session.execute(
            _base(name, func.count(), func.sum(Transaction.amount_pesewas))
            .where(*filters, Transaction.category_l1 == "owner", Transaction.direction == direction)
            .group_by(name).order_by(func.sum(Transaction.amount_pesewas).desc()).limit(5)
        )).all()
        personal.extend(
            {"direction": direction.value, "name": label, "transactions": int(count), "amount": ghs(amount),
             "note": "total for the whole period, not per month"}
            for label, count, amount in rows
        )
    return {
        "period": {"from": start.isoformat() if start else "all records", "to": end.isoformat() if end else "latest"},
        "split": split,
        "biggest_personal": personal,
        "note": "Personal means the owner's own money (family transfers, school fees, cash taken for themself, "
                "money they put in). Lenders look for business and personal money kept apart; personal rows "
                "are left out of sales and costs. not_sorted rows have no category yet.",
    }


async def statement_summary(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    query = (
        select(Document)
        .where(Document.business_id == business_id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
    wanted = args.get("document")
    if isinstance(wanted, str) and wanted.strip():
        query = query.where(Document.storage_key.ilike(f"%{wanted.strip()[:80]}%"))
    documents = (await session.scalars(query.limit(20))).all()
    counts = dict((await session.execute(
        select(Transaction.document_id, func.count())
        .where(Transaction.business_id == business_id, Transaction.document_id.in_([d.id for d in documents]))
        .group_by(Transaction.document_id)
    )).all()) if documents else {}
    document = next((d for d in documents if counts.get(d.id)), documents[0] if documents else None)
    if document is None:
        return {"error": "No uploads match. The owner has not uploaded a statement yet, or the name is different."}
    ingest = (document.quality_flags or {}).get("ai_ingest") or {}
    result: dict[str, Any] = {
        "file": document.filename,
        "type": DOC_TYPE_LABELS.get(document.doc_type.value, "Document") if document.doc_type else "Not known yet",
        "status": "read and counted" if document.status == DocStatus.EXTRACTED else document.status.value.replace("_", " "),
        "reader_note": ingest.get("summary"),
        "rows_read": int(counts.get(document.id, 0)),
        "other_uploads": [d.filename for d in documents if d.id != document.id][:5],
    }
    if not result["rows_read"]:
        result["note"] = "No money rows from this upload count yet (still reading, waiting for the owner to check rows, or not a statement)."
        return result
    filters = [Transaction.business_id == business_id, Transaction.document_id == document.id, *_analysed()]
    first_on, last_on, money_in, money_out = (await session.execute(
        _base(func.min(Transaction.occurred_on), func.max(Transaction.occurred_on), _sum(Direction.IN), _sum(Direction.OUT))
        .where(*filters)
    )).one()
    fees = int(await session.scalar(
        _base(func.coalesce(func.sum(Transaction.fee_pesewas + Transaction.levy_pesewas), 0)).where(*filters)) or 0)
    month = func.date_trunc("month", Transaction.occurred_on).label("month")
    months = (await session.execute(
        _base(month, _sum(Direction.IN), _sum(Direction.OUT)).where(*filters).group_by(month).order_by(month)
    )).all()

    async def biggest(direction: Direction) -> list[dict]:
        rows = (await session.scalars(
            select(Transaction).join(Document, Transaction.document_id == Document.id)
            .where(*filters, Transaction.direction == direction).order_by(Transaction.amount_pesewas.desc()).limit(3)
        )).all()
        return [{"date": r.occurred_on.isoformat(), "amount": ghs(r.amount_pesewas),
                 "who": (r.flags or {}).get("counterparty") or r.description,
                 "category": CATEGORY_LABELS.get(r.category_l1 or "unclassified", r.category_l1)} for r in rows]

    by_month = [{"month": m.date().isoformat()[:7], "money_in": ghs(i), "money_out": ghs(o), "net": ghs(int(i) - int(o)),
                 "money_in_pesewas": int(i)} for m, i, o in months]
    best = max(by_month, key=lambda row: row["money_in_pesewas"])
    return result | {
        "covers": {"from": first_on.isoformat(), "to": last_on.isoformat(), "months": len(by_month)},
        "money_in": ghs(money_in), "money_out": ghs(money_out), "net": ghs(int(money_in) - int(money_out)),
        "charges_and_e_levy": ghs(fees),
        "business_vs_personal": await _split(session, [*_active(business_id), *filters]),
        "by_month": [{k: v for k, v in row.items() if k != "money_in_pesewas"} for row in by_month],
        "month_with_most_money_in": best["month"],
        "biggest_money_in": await biggest(Direction.IN),
        "biggest_money_out": await biggest(Direction.OUT),
    }


_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


async def business_patterns(session: AsyncSession, business_id: UUID, args: dict) -> dict:
    base = [*_active(business_id), *_analysed()]
    sales_filter = [*base, Transaction.direction == Direction.IN, Transaction.category_l1 == "revenue"]
    last_on = await session.scalar(_base(func.max(Transaction.occurred_on)).where(*base))
    if last_on is None:
        return {"error": "No transactions yet, so there are no patterns to read."}

    dow = func.extract("isodow", Transaction.occurred_on).label("dow")
    by_day = (await session.execute(
        _base(dow, func.sum(Transaction.amount_pesewas), func.count(func.distinct(Transaction.occurred_on)))
        .where(*sales_filter).group_by(dow).order_by(dow)
    )).all()
    weekdays = [
        {"day": _WEEKDAYS[int(d) - 1], "sales": ghs(total), "days_traded": int(days),
         "average_sales_per_day": ghs(int(total) // max(int(days), 1)), "_avg": int(total) // max(int(days), 1)}
        for d, total, days in by_day
    ]

    name = func.coalesce(Transaction.flags["counterparty"].astext, Transaction.description, "Unnamed")
    month = func.date_trunc("month", Transaction.occurred_on)
    customers = (await session.execute(
        _base(name, func.sum(Transaction.amount_pesewas), func.count(func.distinct(month)))
        .where(*sales_filter).group_by(name).order_by(func.sum(Transaction.amount_pesewas).desc())
    )).all()
    total_sales = sum(int(amount) for _, amount, _ in customers)
    top3 = sum(int(amount) for _, amount, _ in customers[:3])
    sales_count, = (await session.execute(_base(func.count()).where(*sales_filter))).one()

    recent_start = date(last_on.year, last_on.month, 1)
    for _ in range(2):
        recent_start = date(recent_start.year - (recent_start.month == 1), (recent_start.month - 2) % 12 + 1, 1)
    prior_start = recent_start
    for _ in range(3):
        prior_start = date(prior_start.year - (prior_start.month == 1), (prior_start.month - 2) % 12 + 1, 1)
    cost_filter = [*base, Transaction.direction == Direction.OUT, Transaction.category_l1.in_(("cogs", "opex"))]
    window = case((Transaction.occurred_on >= recent_start, 1), else_=0)
    cost_rows = (await session.execute(
        _base(name, window, func.sum(Transaction.amount_pesewas))
        .where(*cost_filter, Transaction.occurred_on >= prior_start, Transaction.occurred_on <= last_on)
        .group_by(name, window)
    )).all()
    costs: dict[str, list[int]] = {}
    for payee, recent, amount in cost_rows:
        costs.setdefault(payee, [0, 0])[int(recent)] += int(amount)
    moves = sorted(((payee, pair) for payee, pair in costs.items() if pair[1] > pair[0]),
                   key=lambda item: item[1][1] - item[1][0], reverse=True)[:6]
    payees = (await session.execute(
        _base(name, func.sum(Transaction.amount_pesewas), func.count(func.distinct(month)))
        .where(*cost_filter).group_by(name).order_by(func.sum(Transaction.amount_pesewas).desc())
    )).all()
    total_costs = sum(int(amount) for _, amount, _ in payees)

    fees, fee_rows = (await session.execute(
        _base(func.coalesce(func.sum(Transaction.fee_pesewas + Transaction.levy_pesewas), 0),
              func.count().filter(Transaction.fee_pesewas + Transaction.levy_pesewas > 0)).where(*base)
    )).one()
    ranked = sorted(weekdays, key=lambda row: row["_avg"], reverse=True)
    return {
        "covers_up_to": last_on.isoformat(),
        "sales_by_weekday": [{k: v for k, v in row.items() if k != "_avg"} for row in weekdays],
        "best_weekday": ranked[0]["day"] if ranked else None,
        "slowest_weekday": ranked[-1]["day"] if ranked else None,
        "customers": {
            "paying_customers": len(customers),
            "top_3_share_of_sales": percent(top3, total_sales),
            "top_3": [{"name": n, "sales": ghs(a)} for n, a, _ in customers[:3]],
            "came_back_in_3_or_more_months": sum(1 for _, _, months in customers if int(months) >= 3),
        },
        "typical_sale": ghs(total_sales // sales_count) if sales_count else None,
        "momo_and_bank_charges": {"total": ghs(fees), "transactions_charged": int(fee_rows),
                                  "note": "Fees and e-levy taken on top of payments, across all records."},
        "biggest_costs": {
            "stock_and_running_costs_total": ghs(total_costs),
            "by_payee": [{"paid_to": payee, "amount": ghs(int(amount)), "share_of_costs": percent(int(amount), total_costs),
                          "months_paid": int(months)} for payee, amount, months in payees[:5]],
        },
        "costs_that_grew": {
            "note": "Payees paid more in the last 3 months than the 3 before. For stock this usually means more "
                    "was bought (sales may have grown too), not a price rise.",
            "last_3_months": f"{recent_start.isoformat()} to {last_on.isoformat()}",
            "3_months_before": f"{prior_start.isoformat()} to {(recent_start - timedelta(days=1)).isoformat()}",
            "by_payee": [{"paid_to": payee, "3_months_before": ghs(before), "last_3_months": ghs(after),
                          "paid_more_by": ghs(after - before)} for payee, (before, after) in moves],
        },
        "note": "Sales are money in marked as sales. Costs are stock and running costs. Patterns describe the "
                "records only; the owner knows the reasons behind them.",
    }


HANDLERS = {
    "get_cash_flow": cash_flow,
    "get_top_counterparties": top_counterparties,
    "get_category_breakdown": category_breakdown,
    "search_transactions": search_transactions,
    "compare_periods": compare_periods,
    "get_farm_breakdown": farm_breakdown,
    "get_business_vs_personal": business_vs_personal,
    "get_statement_summary": statement_summary,
    "get_business_patterns": business_patterns,
}
