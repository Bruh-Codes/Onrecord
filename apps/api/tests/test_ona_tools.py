import uuid

from app.services.document_reader import DocumentReading, ReadRow
from app.services.ona_tools import (
    business_patterns,
    business_vs_personal,
    cash_flow,
    category_breakdown,
    compare_periods,
    ghs,
    search_transactions,
    statement_summary,
    top_counterparties,
)
from sqlalchemy.ext.asyncio import async_sessionmaker

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
        assert categories["money_in"][0] == {"category": "revenue", "label": "Sales", "transactions": 2, "amount": "GH¢750.00",
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


async def test_money_endpoints_match_ona_tools(client, db_ready, monkeypatch):
    from tests.conftest import bearer_header

    business_id, _ = await _seed(client, db_ready, monkeypatch)
    # _seed's owner is not returned; an admin can read any business.
    headers = bearer_header(role="admin", user_id=uuid.uuid4())
    summary = (await client.get(f"/v1/businesses/{business_id}/money/summary", headers=headers)).json()
    assert summary["earliest_on"] == "2026-01-05" and summary["latest_on"] == "2026-02-25"
    assert summary["cash_flow"]["totals"]["net"] == "GH¢1,300.00"
    assert summary["top_suppliers"]["counterparties"][0]["name"] == "AGRO INPUTS"
    assert summary["documents_awaiting_review"] == 0

    page = (await client.get(
        f"/v1/businesses/{business_id}/money/transactions",
        params={"direction": "out", "limit": 1, "sort": "largest"}, headers=headers,
    )).json()
    assert page["matches"] == 2 and page["money_out_pesewas"] == 45000
    assert len(page["items"]) == 1 and page["items"][0]["counterparty"] == "AGRO INPUTS"
    assert page["items"][0]["document_name"] == "momo.pdf"


async def test_tools_skip_rows_the_analytics_exclude(client, db_ready, monkeypatch):
    from app.models.transaction import Transaction
    from sqlalchemy import update

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


async def test_statement_split_and_patterns_for_owner_questions(client, db_ready, monkeypatch):
    from app.models.transaction import Transaction
    from sqlalchemy import update

    business_id, sessions = await _seed(client, db_ready, monkeypatch)
    async with sessions() as session:
        # The transport payment was really the owner's own (personal) spending.
        await session.execute(
            update(Transaction)
            .where(Transaction.business_id == business_id, Transaction.amount_pesewas == 15000)
            .values(category_l1="owner")
        )
        await session.commit()

        split = await business_vs_personal(session, business_id, {"start_date": None, "end_date": None})
        assert split["split"]["business"]["money_out"] == "GH¢300.00"
        assert split["split"]["personal"]["money_out"] == "GH¢150.00"
        assert split["split"]["personal"]["share_of_money_out"] == "33%"
        assert split["biggest_personal"][0]["name"] == "TRANSPORT"

        statement = await statement_summary(session, business_id, {"document": "momo"})
        assert statement["type"] == "MoMo statement" and statement["rows_read"] == 5
        assert statement["covers"] == {"from": "2026-01-05", "to": "2026-02-25", "months": 2}
        assert statement["money_in"] == "GH¢1,750.00"
        assert statement["month_with_most_money_in"] == "2026-01"
        assert statement["business_vs_personal"]["personal"]["money_out"] == "GH¢150.00"
        assert (await statement_summary(session, business_id, {"document": "nothing-like-this"}))["error"]

        flow = await cash_flow(session, business_id, {"group_by": "month", "start_date": None, "end_date": None})
        assert flow["most_sales_period"] == "2026-01" and flow["totals"]["sales"] == "GH¢1,750.00"

        patterns = await business_patterns(session, business_id, {})
        assert patterns["customers"]["top_3"][0] == {"name": "KOFI MARKET", "sales": "GH¢1,250.00"}
        assert patterns["typical_sale"] == "GH¢583.33"
        assert patterns["best_weekday"] and patterns["slowest_weekday"]
        assert patterns["biggest_costs"]["by_payee"][0] == {
            "paid_to": "AGRO INPUTS", "amount": "GH¢300.00", "share_of_costs": "100%", "months_paid": 1}
        assert patterns["costs_that_grew"]["by_payee"][0]["paid_more_by"] == "GH¢300.00"


def test_indicator_summary_skips_empty_lead_months_and_never_adds_averages():
    from app.services.ona import _summarize_indicator

    series = {"series": [{"m": "2026-01", "v": 0}, {"m": "2026-02", "v": 10000}, {"m": "2026-03", "v": 20000}]}
    average = _summarize_indicator(series, "pesewas", "AVG_TICKET")
    assert [m["month"] for m in average["months"]] == ["2026-02", "2026-03"]
    assert average["average_per_month"] == "GH¢150.00" and "total" not in average
    assert _summarize_indicator(series, "pesewas", "REV_MONTHLY")["total"] == "GH¢300.00"
    assert _summarize_indicator({"v": 0.2918}, "ratio", "OPEX_RATIO")["value_percent"] == "29.2%"


def test_groq_tools_make_nullable_inputs_optional():
    from app.services.ona_groq import _function_tools

    tools = {tool["function"]["name"]: tool["function"]["parameters"] for tool in _function_tools(False)}
    # gpt-oss sends {} for "all time"; Groq rejects that when nullable dates are required.
    assert tools["get_business_vs_personal"]["required"] == []
    assert "start_date" in tools["get_business_vs_personal"]["properties"]
