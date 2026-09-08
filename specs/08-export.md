# 08-S10 Export

Module: `app/pipeline/s10_export.py`

Produces the artefact that goes to a lender. This is the product's output; treat
its correctness as you would a financial statement.

---

## Formats

`POST /v1/businesses/{id}/exports` with `{"format": "pdf" | "json" | "csv" | "pack"}`.

- **pdf**-the Financial Profile, human-readable, for the loan officer
- **json**-machine-readable, for institutions integrating
- **csv**-the normalised transaction ledger
- **pack**-a zip of all three plus the source documents

---

## PDF structure

Built with WeasyPrint from a Jinja template in `app/pipeline/templates/profile/`.
Runs in the worker.

```
1. Cover
   Business name, registration number, TIN, sector, period covered,
   generation timestamp, readiness band.
   Disclaimer block (§4)-on the cover, not buried.

2. Summary
   Readiness band + pillar breakdown with attribution reasons.
   Coverage statement: "12 months of MoMo statements, 6 months bank,
   one 3-week gap in March 2026."

3. Revenue
   REV_MONTHLY chart + table, REV_TTM, REV_GROWTH_3M, REV_VOLATILITY,
   SEASONALITY_INDEX, ACTIVE_TRADING_DAYS, CUSTOMER_COUNT, AVG_TICKET.

4. Costs and margin
   OPEX_RATIO, GROSS_MARGIN_PROXY (or its insufficient_data reason),
   expense breakdown by category_l2.

5. Cashflow and liquidity
   OPERATING_CASHFLOW, NET_CASHFLOW, AVG_DAILY_BALANCE,
   CASH_BUFFER_DAYS, NEGATIVE_BALANCE_DAYS.

6. Obligations and concentration
   EXISTING_DEBT_SERVICE, REV_CONCENTRATION, DSO_PROXY.

7. Indicative repayment capacity
   AFFORDABILITY_HEADROOM with its mandatory caption.

8. Items requiring attention
   Outliers (flags.outlier), unpaired cash-outs, open inconsistency gaps.
   Listed, not hidden.

9. Owner-stated information
   Every DECLARED value, visually distinct, each labelled
   "Stated by the business owner. Not verified against documents."

10. Document checklist
    Satisfied / missing / not applicable, against the named rule pack.

11. Evidence index
    Every indicator → the documents and page numbers behind it.

12. Source documents
    Thumbnail index with document type, issuer, period, page count.
```

## Rendering rules

- Money formatted `GH¢1,234.56` at the display boundary only. The template
  receives integer pesewas and formats; no float ever enters the template context.
- `insufficient_data` indicators render as "Not enough data-needs 6 complete
  months, 4 available", never as blank, zero, or a dash.
- `DECLARED` values use a distinct treatment (tint block + label). They MUST NOT
  appear in the same table as `DERIVED` figures without the label.
- Charts rendered server-side as inline SVG. Every axis label names a value the
  chart reaches; tabular figures accompany every chart.

---

## 4. Mandatory disclaimer

On the cover of every PDF and in the `meta` block of every JSON export, verbatim:

> This profile organises records supplied by the business. It is not a credit
> assessment, credit score, or recommendation to lend.

Also required on the `AFFORDABILITY_HEADROOM` section:

> Indicative monthly repayment capacity, derived from operating cashflow. This is
> not a lending decision or a credit assessment.

Removing or weakening either string is a rejected change (INV-5).

---

## 5. JSON export schema

```json
{
	"meta": {
		"schema_version": "1.0.0",
		"generated_at": "2026-08-29T14:02:11Z",
		"formula_version": "1.0.0",
		"rubric_version": "1.0.0",
		"disclaimer": "This profile organises records supplied by the business. It is not a credit assessment, credit score, or recommendation to lend."
	},
	"business": { "...": "..." },
	"coverage": { "...": "..." },
	"indicators": [
		{
			"code": "REV_TTM",
			"unit": "pesewas",
			"kind": "derived",
			"value": { "v": 5955000 },
			"window": { "from": "2025-09-01", "to": "2026-08-31" },
			"inputs": { "transaction_ids": ["..."] }
		}
	],
	"score": {
		"total": 72.5,
		"band": "nearly_ready",
		"pillars": {},
		"contributions": []
	},
	"declarations": [
		{
			"question": "...",
			"answer_text": "...",
			"kind": "declared",
			"verification_status": "unverified"
		}
	],
	"checklist": [],
	"gaps_open": [],
	"documents": [{ "id": "...", "doc_type": "momo_statement", "sha256": "..." }]
}
```

Every indicator carries `kind`. Every declaration carries `kind: "declared"`.
A consumer must be able to separate verified from stated without parsing prose.

---

## 6. CSV export

The normalised ledger, one row per transaction, columns:

```
occurred_on, account_display, direction, amount_ghs, fee_ghs, levy_ghs,
balance_after_ghs, counterparty, category_l1, category_l2, category_source,
flags, document_id, page
```

Money in this file is decimal GHS with 2 places-it is for humans and
spreadsheets. Note in the header comment that the authoritative values are the
integer pesewas in the JSON export.

---

## 7. Sharing

`POST /v1/exports/{id}/share` produces a scoped link:

- expires in 14 days (configurable per institution)
- revocable by the owner at any time
- access-logged; the owner can see who opened it and when
- consent to share with a named lender is recorded separately from consent to
  analyse (Act 843, see AGENTS.md §6)

Signed download URLs expire in 15 minutes and are single-issue.

---

## 8. Tests

- Export of the `adom_provisions` fixture matches a golden PDF text extraction.
- No float appears in the template context (assert on the context dict types).
- Removing the disclaimer string fails a test by design.
- A `DECLARED` value never appears inside a `DERIVED` table.
- The generated PDF opens in Adobe Reader, Chrome PDF viewer and WhatsApp preview.
