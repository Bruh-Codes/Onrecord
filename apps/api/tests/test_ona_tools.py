import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.services.document_reader import DocumentReading, ReadRow
from app.services.ona_tools import cash_flow, category_breakdown, compare_periods, ghs, search_transactions, top_counterparties

from tests.test_document_review import _document, _stage


def _row(day, direction, amount, balance, counterparty, category):
    return ReadRow(
        occurred_on=day, description=f"{'Payment from' if direction == 'in' else 'Paid to'} {counterparty}",
        counterparty=counterparty, reference=f"{day}-{amount}", direction=direction, amount=amount, fee=None,
        levy=None, balance_after=balance, category=category, page=1, source_ref="page:1",
    )


async def _seed(client, db_ready, monkeypatch):
    from app.workers.tasks import recompute

    monkeypatch.setattr(recompute, "delay", lambda *_: None)
    _, business_id, document_id = await _document(client, b"ona-tools")
    rows = [
        _row("2026-01-05", "in", "1,000.00", "1,000.00", "KOFI MARKET", "revenue"),
        _row("2026-01-20", "out", "300.00", "700.00", "AGRO INPUTS", "cogs"),
        _row("2026-02-03", "in", "500.00", "1,200.00", "AMA STORES", "revenue"),
        _row("2026-02-10", "in", "250.00", "1,450.00", "KOFI MARKET", "revenue"),
        _row("2026-02-25", "out", "150.00", "1,300.00", "TRANSPORT", "opex"),
    ]
    reading = DocumentReading(
        doc_type="momo_statement", provider="MTN", account_label="9999", currency="GHS", period_start=None,
        period_end=None, opening_balance="0.00", closing_balance="1,300.00", confidence=0.95, summary="",
        findings=(), rows=tuple(rows), model="test",
    )
    assert await _stage(db_ready, document_id, reading) is True
    return uuid.UUID(business_id), async_sessionmaker(db_ready, expire_on_commit=False)


def test_ghs_formats_pesewas():
    assert ghs(125050) == "GH¢1,250.50"
    assert ghs(-5) == "-GH¢0.05"


async def test_tools_answer_from_stored_transactions(client, db_ready, monkeypatch):
    business_id, sessions = await _seed(client, db_ready, monkeypatch)
    async with sessions() as session:
        flow = await cash_flow(session, business_id, {"group_by": "month", "start_date": None, "end_date": None})
        assert [p["period"] for p in flow["periods"]] == ["2026-01", "2026-02"]
        assert flow["periods"][0]["net"] == "GH¢700.00"
        assert flow["periods"][1]["net_change_from_previous"] == "-GH¢100.00"
        assert flow["totals"]["money_in"] == "GH¢1,750.00"
        assert flow["best_period"] == "2026-01"

        top = await top_counterparties(session, business_id, {"direction": "in", "start_date": None, "end_date": None, "limit": 5})
        assert top["counterparties"][0]["name"] == "KOFI MARKET"
        assert top["counterparties"][0]["amount"] == "GH¢1,250.00"
        assert top["counterparties"][0]["share_of_total"] == "71%"

        categories = await category_breakdown(session, business_id, {"start_date": "2026-02-01", "end_date": None})
        assert categories["total_out"] == "GH¢150.00"
        assert categories["money_in"][0] == {"category": "revenue", "transactions": 2, "amount": "GH¢750.00",
                                             "amount_pesewas": 75000, "share": "100%"}

        found = await search_transactions(session, business_id, {
            "query": "kofi", "direction": None, "category": None, "start_date": None, "end_date": None,
            "min_amount_ghs": None, "max_amount_ghs": None, "sort": "largest", "limit": 10,
        })
        assert found["matches"] == 2 and found["money_in_total"] == "GH¢1,250.00"
        assert found["transactions"][0]["amount"] == "GH¢1,000.00"

        compared = await compare_periods(session, business_id, {
            "first_start": "2026-01-01", "first_end": "2026-01-31",
            "second_start": "2026-02-01", "second_end": "2026-02-28",
        })
        assert compared["change"]["money_in"] == "-GH¢250.00"
        assert compared["change"]["money_in_percent"] == "-25%"
        assert compared["change"]["net"] == "-GH¢100.00"


async def test_tools_skip_rows_the_analytics_exclude(client, db_ready, monkeypatch):
    from sqlalchemy import update

    from app.models.transaction import Transaction

    business_id, sessions = await _seed(client, db_ready, monkeypatch)
    async with sessions() as session:
        await session.execute(
            update(Transaction)
            .where(Transaction.business_id == business_id, Transaction.amount_pesewas == 25000)
            .values(flags=Transaction.flags.op("||")({"duplicate": True}))
        )
        await session.commit()

        flow = await cash_flow(session, business_id, {"group_by": "month", "start_date": None, "end_date": None})
        assert flow["totals"]["money_in"] == "GH¢1,500.00"
        categories = await category_breakdown(session, business_id, {"start_date": "2026-02-01", "end_date": None})
        assert categories["total_in"] == "GH¢500.00"

        found = await search_transactions(session, business_id, {
            "query": None, "direction": None, "category": None, "start_date": None, "end_date": None,
            "min_amount_ghs": 300.0, "max_amount_ghs": 300.0, "sort": "largest", "limit": 10,
        })
        assert found["matches"] == 1 and found["transactions"][0]["amount"] == "GH¢300.00"
