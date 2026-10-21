"""Pure integer arithmetic shared by dashboard, insights and report."""
import hashlib
from collections import defaultdict
from datetime import UTC, datetime

from app.schemas.agriculture import EntryOut, FinanceGroup, FinanceTotals, FarmReport

METHOD = (
    "Recorded operating surplus = gross recorded farm receipts minus recorded operating expenditures. "
    "Source fees and levies are included once as expenditures. Loans, owner transfers, excluded source rows "
    "and unallocated statement transactions are not farm receipts. Shared overhead is retained separately "
    "and included once in business totals; enterprise and cycle filters exclude it. Self-reported totals "
    "are shown separately from document-extracted subtotals and never feed readiness indicators. "
    "This is a record summary, not net profit, an audit, independent verification or loan approval."
)


def total(entries: list[EntryOut]) -> FinanceTotals:
    receipts = sum(row.amount_pesewas for row in entries if row.kind == "income")
    expenditures = sum(row.amount_pesewas for row in entries if row.kind == "expense")
    expenditures += sum(row.fee_pesewas + row.levy_pesewas for row in entries)
    return FinanceTotals(receipts_pesewas=receipts, expenditures_pesewas=expenditures,
                         surplus_pesewas=receipts-expenditures, count=len(entries),
                         without_evidence=sum(row.evidence_status == "none" for row in entries))


def money(value: int) -> str:
    sign = "−" if value < 0 else ""
    whole, fraction = divmod(abs(value), 100)
    return f"GHS {sign}{whole:,}.{fraction:02d}"


def build_report(business, entries, *, enterprise_id=None, cycle_id=None, from_date=None, to_date=None, cycle=None):
    totals = total(entries)
    sources = {kind: total([row for row in entries if row.value_kind == kind]) for kind in ("declared", "extracted")}
    enterprises, months = defaultdict(list), defaultdict(list)
    labels = {}
    for row in entries:
        key = str(row.enterprise_id) if row.enterprise_id else "shared_overhead"
        enterprises[key].append(row)
        labels[key] = row.enterprise_name or "Shared overhead (unallocated)"
        months[row.occurred_on.strftime("%Y-%m")].append(row)
    warnings = ["Records are not independently verified; attachments do not establish authenticity or completeness."]
    if not entries:
        warnings.append("No financial activity recorded for this scope. Missing activity is not zero activity.")
    if totals.without_evidence:
        warnings.append(f"{totals.without_evidence} of {totals.count} records have no linked supporting document.")
    if sources["declared"].count:
        warnings.append("Self-reported entries may omit cash activity, debts, unpaid obligations and depreciation.")
    if enterprise_id or cycle_id:
        warnings.append("Unallocated shared overhead is excluded from this enterprise/cycle view; see business totals.")
    if cycle and (not cycle.end_date or cycle.stage.value != "completed"):
        warnings.append("This cycle is not marked complete. Receipts and costs may occur in different periods.")
    if cycle and ((from_date and from_date > cycle.start_date) or (to_date and cycle.end_date and to_date < cycle.end_date)):
        warnings.append("The report covers only part of the selected production cycle.")
    seen = set()
    for row in entries:
        key = (row.occurred_on, row.kind, row.amount_pesewas, row.description.casefold())
        if key in seen:
            warnings.append("Similar entries may be duplicates. Review their sources; similarity is not evidence of fraud.")
            break
        seen.add(key)
    insights = ["Rules-based insights computed from the selected records."]
    if entries:
        insights.append(f"Gross receipts are {money(totals.receipts_pesewas)}, recorded expenditures are {money(totals.expenditures_pesewas)}, and recorded operating surplus is {money(totals.surplus_pesewas)}.")
        costs = [row for row in entries if row.kind == "expense"]
        if costs:
            largest = max(costs, key=lambda row: row.amount_pesewas)
            insights.append(f"The largest single recorded expense is {largest.category}: {money(largest.amount_pesewas)}.")
        insights.append("Crop seasons, animal batches and pond cycles have different cash-flow timings. Compare complete cycles before interpreting a surplus.")
    versions = "|".join(row.model_dump_json() for row in sorted(entries, key=lambda row: str(row.id)))
    return FarmReport(
        business_id=business.id, business_name=business.trading_name or business.legal_name, region=business.region,
        is_demo=business.is_demo, generated_at=datetime.now(UTC),
        period_from=from_date or min((row.occurred_on for row in entries), default=None),
        period_to=to_date or max((row.occurred_on for row in entries), default=None),
        enterprise_id=enterprise_id, cycle_id=cycle_id, totals=totals, sources=sources,
        enterprises=[FinanceGroup(key=key, label=labels[key], **total(rows).model_dump()) for key, rows in enterprises.items()],
        months=[FinanceGroup(key=key, label=key, **total(months[key]).model_dump()) for key in sorted(months)],
        warnings=warnings, insights=insights, method=METHOD, entries=entries,
        record_version=hashlib.sha256(versions.encode()).hexdigest()[:16],
    )
