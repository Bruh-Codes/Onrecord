# Onrecord document pipeline

This guide explains what happens after a business uploads a document. The
pipeline has two outputs on purpose:

- **Business insights:** what can be read from the records, with uncertainty
  shown when necessary.
- **Readiness evidence:** the smaller set of facts that are trustworthy enough
  to contribute to the readiness score.

A document can appear in insights while being excluded from readiness evidence.
That is expected and protects the score from weak or suspicious data.

## The flow

```text
Upload → S1 ingest → S2 classify → S3 extract → S4 normalise → S5 reconcile
       → evidence review → S6 categorise → S7 analyse → S8 readiness score
       → S9 checklist and gaps → human review / S10 export
```

## Supported document families

| Family | Deterministic output | Insight treatment |
| --- | --- | --- |
| Bank / MoMo statements | Transactions, balances, direction, fees, account provenance | Feeds transaction trends after reconciliation; internal transfers are excluded from operating metrics |
| Financial statements | Every printed line item, period, section, canonical mapping, and validation issue | Shows the original structure; only eligible evidence contributes to readiness |
| Invoices (issued/received) | Canonical invoice envelope, line items, dynamic extra fields, raw labels, and page provenance | Visible as business evidence; not treated as cash movement until matched/confirmed |
| Receipts and informal ledgers | Classified and evidence-reviewed; structured extraction is added only when their layout has a reliable parser | Visible with uncertainty; never silently added to scoring |
| Registration, tax, projection, and identity documents | Classified document evidence and review state | Satisfy checklist requirements only when the required document type is actually present |

## Stage-by-stage

### 0. Upload

The browser asks the API for a short-lived upload URL. The file goes directly
to the private object store; the browser never receives database credentials or
an OpenAI key. The API records the business, uploader, file type, SHA-256 hash,
and storage key. A duplicate active file is rejected.

### S1 — Ingest

The Celery worker reads the private object, runs Docling, and stores the lossless
Docling representation and page count. OCR and layout models recover text and
tables from scans. Originals remain the source evidence. If the worker cannot
read the file, it becomes `failed` and no financial rows are created.

### S2 — Classify

The system identifies document type, issuer, and period: for example,
`momo_statement`, `bank_statement`, `financial_statement`, invoice, receipt, or
tax document. Classification carries a confidence and an explanation.
Unsupported or ambiguous files do not become financial evidence.

### S3 — Extract

Docling output is converted into structured fields. Transaction parsers find
headers by meaning (date, amount, debit/credit, balance), then extract dates,
direction, amounts, fees, levies, balances, descriptions, and references. They
do not depend on one fixed column position. Financial statements retain every
printed line item and period with page/provenance information. Unknown labels
are preserved instead of dropped.

Amounts are stored as integer pesewas. The parser owns facts; AI does not invent
or rewrite them.

#### Invoice envelope

Invoices use the same provider-neutral strategy. Docling supplies text, layout,
and table cells; the configured OpenAI model semantically maps that evidence to
a small canonical envelope: supplier, invoice number, invoice date, due date,
currency, subtotal, tax, total, payment status, and line items. Every returned
field must retain its raw value and source reference. Any vendor-specific labels
are kept in `extra_fields`, so a Cloudflare, Zoho, or future supplier layout does
not require a template or a growing regex list. Deterministic checks only flag
missing totals, date inconsistencies, and subtotal/tax/total mismatches. An
invoice total is never inferred. Invoice evidence is available to insights; it
is not converted into operating transactions until a later matching/confirmation
stage.

### S4 — Normalise

Extracted fields become canonical transactions. Direction is separate from the
positive amount, fees and e-levy remain separate, account identifiers are
hashed, and each transaction keeps extraction provenance.

### S5 — Reconcile

The pipeline checks balance movement, identifies duplicates, flags internal
transfers, and builds statement coverage across uploads. Failed or suspicious
reconciliation is not silently treated as clean evidence. Internal transfers
can remain visible in insights but are excluded from operating metrics.

### Evidence review — AI safety gate

After deterministic extraction, the worker creates an evidence-review result.
OpenAI receives a sanitized, structure-focused representation: numeric runs,
dates, account numbers, phone numbers, and document identifiers are redacted.
The model cannot change transactions or financial values.

The model returns a strict result with a `status` (`clear`, `warning`, or
`error`), `risk_level`, summary, and findings. Each finding includes a code,
severity, reason, and evidence reference. The model must describe a signal; it
must not claim a document is forged or make a lending decision. A timeout,
malformed response, or missing model creates `pending` and fails closed.

| State | Business insights | Readiness score | Next step |
| --- | --- | --- | --- |
| `clear` | Visible | Eligible | Continue normally |
| `pending` | Visible | Excluded | Wait for or retry review |
| `warning` | Visible | Excluded | Onrecord human review |
| `error` | Visible | Excluded | Fix or review extraction |
| `approved` | Visible | Eligible | Reviewer accepted it |
| `rejected` | Visible | Excluded | Replace or correct the evidence |

Every AI review and human decision is retained in review history and audit
events. Review findings are not financial facts.

### S6 — Categorise

Transactions first use deterministic rules. Unresolved labels may be sent to
Luna in batches with only sanitized labels, direction mix, and counts. Luna can
return a category and confidence, but not amounts or balances. Low-confidence
results remain `unclassified` until a person or later evidence resolves them.

### S7 — Analyse

Deterministic formulas calculate transaction value, revenue, operating expenses,
cashflow, active trading days, average ticket, coverage, and other indicators.
These are insights, not a credit decision. Internal transfers and excluded
flags are omitted from the relevant operating metrics.

### S8 — Readiness score

The readiness score is a transparent 100-point evidence score, not a probability
of default, credit score, or lending recommendation:

- **Coverage — 30:** statement history, continuity, account coverage,
  unclassified value, and missing periods.
- **Legibility — 25:** whether core indicators can be computed.
- **Documentation — 30:** required checklist documents that are extracted.
- **Verifiability — 15:** how much activity is backed by eligible evidence.

Documents in `pending`, `warning`, `error`, or `rejected` evidence states remain
useful for insights but do not contribute to eligible scoring inputs. Every score
stores pillar contributions and reasons so a reviewer can explain it.

### S9 — Checklist and gaps

The selected lender/rule pack is evaluated against active documents. This
creates credit-readiness gaps such as missing registration, tax, cashflow
projection, or additional statement history. These gaps do not mean the uploaded
statement failed, and they do not remove insights.

Gaps are derived state: when a later upload satisfies a requirement, the old
open gap is resolved during recompute. Soft-deleted documents are never used.

### Human review

Onrecord reviewers/admins can inspect AI reasons and evidence references, then
approve or reject a case with a note. The API records reviewer, time, decision,
and audit event, then queues recompute. Owners can see the review state and
explanation but cannot approve their own evidence.

```text
GET  /v1/businesses/{business_id}/evidence-reviews
GET  /v1/documents/{document_id}/evidence-review
POST /v1/documents/{document_id}/evidence-review/resolve
```

### S10 — Export (planned)

The export stage will produce a lender-facing PDF/JSON/CSV profile containing
only eligible, provenance-linked facts, score contributions, unresolved gaps,
and review decisions. Owner-declared values remain visibly separate and are not
silently mixed into derived figures.

## What to remember

1. Docling and deterministic code own the facts.
2. AI explains categories and evidence risks; it does not rewrite numbers.
3. Insights can be useful before the file is lender-ready.
4. Only eligible evidence contributes to readiness scoring.
5. Human review resolves ambiguous or risky cases with an audit trail.
