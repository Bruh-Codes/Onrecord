# 00-Domain Model

Canonical data model. Every other spec references these names. Do not rename a
column without updating every spec that mentions it.

Prerequisite: `AGENTS.md` §2 invariants, especially INV-1 (integer pesewas) and
INV-2 (EXTRACTED / DERIVED / DECLARED).

---

## 1. Enums

`app/models/enums.py`. Postgres native enums; adding a value requires a migration.

```python
class EntityType(StrEnum):
    SOLE_PROP = "sole_prop"; PARTNERSHIP = "partnership"
    LTD = "ltd"; NGO = "ngo"

class AccountKind(StrEnum):
    MOMO = "momo"; BANK = "bank"; POS = "pos"; CASH_BOOK = "cash_book"

class Provider(StrEnum):
    MTN = "MTN"; TELECEL = "TELECEL"; AT = "AT"
    GCB = "GCB"; FIDELITY = "FIDELITY"; ABSA = "ABSA"; STANBIC = "STANBIC"
    ECOBANK = "ECOBANK"; CBG = "CBG"; OTHER_BANK = "OTHER_BANK"

class DocType(StrEnum):
    MOMO_STATEMENT = "momo_statement"
    MOMO_MERCHANT_STATEMENT = "momo_merchant_statement"
    BANK_STATEMENT = "bank_statement"
    INVOICE_ISSUED = "invoice_issued"
    INVOICE_RECEIVED = "invoice_received"
    RECEIPT = "receipt"
    INFORMAL_LEDGER = "informal_ledger"
    REGISTRATION_CERT = "registration_cert"
    TAX_DOC = "tax_doc"
    TENANCY_AGREEMENT = "tenancy_agreement"
    STOCK_LIST = "stock_list"
    FINANCIAL_STATEMENT = "financial_statement"
    CASHFLOW_PROJECTION = "cashflow_projection"
    ID_DOCUMENT = "id_document"
    OTHER = "other"

class DocStatus(StrEnum):
    RECEIVED = "received"; CLASSIFIED = "classified"
    EXTRACTED = "extracted"; RECONCILIATION_FAILED = "reconciliation_failed"
    FAILED = "failed"; SUPERSEDED = "superseded"

class Direction(StrEnum):
    IN = "in"; OUT = "out"

class ValueKind(StrEnum):
    EXTRACTED = "extracted"; DERIVED = "derived"; DECLARED = "declared"

class CategorySource(StrEnum):
    RULE = "rule"; KNN = "knn"; LLM = "llm"
    HUMAN = "human"; OWNER_STATED = "owner_stated"

class CounterpartyKind(StrEnum):
    CUSTOMER = "customer"; SUPPLIER = "supplier"; STAFF = "staff"
    LENDER = "lender"; TAX = "tax"; SELF = "self"; UNKNOWN = "unknown"

class GapKind(StrEnum):
    MISSING_DOCUMENT = "missing_document"
    MISSING_PERIOD = "missing_period"
    UNEXPLAINED_TXN = "unexplained_txn"
    AMBIGUOUS_CATEGORY = "ambiguous_category"
    INCONSISTENCY = "inconsistency"
    MISSING_FACT = "missing_fact"

class GapSeverity(StrEnum):
    BLOCKER = "blocker"; MAJOR = "major"; MINOR = "minor"

class GapStatus(StrEnum):
    OPEN = "open"; ANSWERED = "answered"
    DOCUMENT_RECEIVED = "document_received"
    WAIVED = "waived"; RESOLVED = "resolved"

class Band(StrEnum):
    NOT_READY = "not_ready"        # 0-39
    DEVELOPING = "developing"      # 40-64
    NEARLY_READY = "nearly_ready"  # 65-84
    LENDER_READY = "lender_ready"  # 85-100

class Role(StrEnum):
    OWNER = "owner"; REVIEWER = "reviewer"; ADMIN = "admin"
```

## 2. Transaction categories

Two levels. L1 drives indicators; L2 drives the owner-facing breakdown.
Stored as two columns: `category_l1`, `category_l2`.

```
revenue       → sales_cash, sales_momo, sales_pos, sales_invoice_settlement
cogs          → stock_purchase, raw_materials, freight_in
opex          → rent, utilities, airtime_data, transport, wages, marketing,
                repairs, bank_charges, momo_fees, elevy
tax           → vat, income_tax, withholding, assembly_permit, ssnit
financing_in  → loan_disbursement, overdraft_draw, susu_payout, investor_capital
financing_out → loan_repayment, interest, susu_contribution
owner         → owner_draw, owner_contribution, personal_spend
internal      → wallet_to_bank, bank_to_wallet, between_own_accounts
unknown       → (no L2)
```

**Rules:**

- `internal` and `unknown` MUST NOT count as revenue or expense in any indicator.
- `financing_in` is NOT revenue. A loan disbursement misread as revenue is the
  single most damaging categorisation error in the system.
- `owner.owner_contribution` is NOT revenue.
- Operating outflow `E` used in analytics = `cogs + opex + tax`. It excludes
  `financing_out` and `owner`.

---

## 3. Tables

SQLAlchemy 2.0 declarative. All PKs are UUIDv7. All tables carry
`created_at timestamptz not null default now()`.

### `business`

```
id, legal_name, trading_name, entity_type EntityType,
registration_number, tin, sector_code,        -- ISIC rev4 coarse, 2 digits
established_on date, region, premises_status, -- 'rented' | 'owned' | 'none'
employee_count_declared int
```

`premises_status` and `employee_count_declared` are DECLARED. Mark them so in the
API response (`{"value": ..., "kind": "declared"}`).

### `account`

```
id, business_id FK, kind AccountKind, provider Provider,
identifier_hash text,        -- sha256(msisdn|acctno + PEPPER)
display_suffix varchar(4),   -- last 3-4 digits, display only
currency char(3) default 'GHS',
is_business_use bool, ownership_confidence numeric(3,2)
```

Unique on `(business_id, identifier_hash)`.

### `document`

```
id, business_id FK, uploaded_by FK->user, storage_key text, sha256 char(64),
mime, page_count int, doc_type DocType, doc_type_confidence numeric(3,2),
issuer Provider null, period_start date null, period_end date null,
status DocStatus, quality_flags jsonb
```

`quality_flags`: `{"blurry": bool, "cropped": bool, "glare": bool, "partial_page": bool}`.
Unique on `(business_id, sha256)`-same file uploaded twice is rejected at S1.
A global (cross-business) index on `sha256` exists for fraud detection; a collision
across businesses raises a `suspect` flag, it does not block.

### `extraction`-append-only

```
id, document_id FK, page int, field_path text, value_json jsonb,
bbox jsonb,                  -- {"x":,"y":,"w":,"h":} in page-render pixel space
extractor text,              -- "parser:momo_mtn_v2" | "vision:claude" | "ocr:paddle"
confidence numeric(3,2), superseded_by uuid null
```

Never UPDATE a row's `value_json`. To correct, insert a new row and set
`superseded_by` on the old one.

### `transaction`

```
id, business_id FK, account_id FK, document_id FK,
occurred_on date, posted_at timestamptz null,
direction Direction,
amount_pesewas bigint not null check (amount_pesewas > 0),
fee_pesewas bigint not null default 0,
levy_pesewas bigint not null default 0,
balance_after_pesewas bigint null,
counterparty_raw text, counterparty_id FK null,
provider_reference text null,
category_l1 text, category_l2 text null,
category_confidence numeric(3,2), category_source CategorySource,
flags jsonb, provenance jsonb
```

`amount_pesewas` is always positive; sign is carried by `direction`.
`flags`: `{"internal_transfer": bool, "duplicate": bool, "reversal": bool,
"fx": bool, "suspect": bool, "outlier": bool}`.
`provenance`: `{"extraction_ids": [uuid, ...]}`-MUST be non-empty (INV-7).

Indexes: `(business_id, occurred_on)`, `(account_id, occurred_on, amount_pesewas)`,
`(business_id, category_l1)`, unique partial on
`(account_id, provider_reference) where provider_reference is not null`.

### `counterparty`

```
id, business_id FK, canonical_name text, msisdn_hash text null,
kind CounterpartyKind, first_seen date, last_seen date,
txn_count int, total_in_pesewas bigint, total_out_pesewas bigint,
embedding vector(1024) null
```

### `indicator`

```
id, business_id FK, code text, period_start date, period_end date,
value_json jsonb, unit text, formula_version text,
inputs jsonb, computed_at timestamptz
```

`value_json` is either `{"v": <number>}`, `{"series": [{"m": "2026-01", "v": n}, ...]}`,
or `{"status": "insufficient_data", "reason": "..."}`.
`unit` ∈ `pesewas | ratio | days | count | index | months`.
`inputs`: `{"transaction_ids": [...]}` or `{"indicator_codes": [...]}`.
Unique on `(business_id, code, period_start, period_end, formula_version)`.

### `readiness_score`

```
id, business_id FK, computed_at, rubric_version text,
total numeric(5,2), band Band, pillars jsonb, contributions jsonb
```

`pillars`: `{"coverage": {"earned": n, "available": 30}, "legibility": {...},
"documentation": {...}, "verifiability": {...}}`.
`contributions`: array of `{"component": str, "pillar": str, "earned": n,
"available": n, "reason": str}`. Every point must be attributable.

### `gap`

```
id, business_id FK, kind GapKind, severity GapSeverity, code text,
title text, detail text, target_ref jsonb, status GapStatus,
resolution jsonb null, resolved_at null
```

`target_ref` identifies what the gap is about:
`{"counterparty_id": ...}` | `{"transaction_ids": [...]}` |
`{"account_id": ..., "from": "2026-02-03", "to": "2026-05-03"}` |
`{"doc_type": "tenancy_agreement"}`.
`code` is a stable string for analytics, e.g. `MISSING_PERIOD_MOMO`,
`UNCLASSIFIED_COUNTERPARTY`, `STATEMENT_DOES_NOT_RECONCILE`.

### `declaration`

```
id, business_id FK, gap_id FK null, question text, answer_text text,
parsed_value jsonb null, asked_by text,   -- 'agent' | 'reviewer'
captured_at, verification_status text     -- 'unverified' | 'corroborated' | 'contradicted'
```

This table is the ONLY place owner-stated facts live. Nothing here feeds a formula.

### `checklist_item`

```
id, business_id FK, rule_pack_id text, doc_type DocType,
requirement text,             -- 'required' | 'conditional' | 'optional'
condition_expr text null, constraint_json jsonb null,
satisfied_by_document_id FK null, status text  -- 'satisfied' | 'missing' | 'not_applicable'
```

### `agent_session` / `agent_message`

```
agent_session: id, business_id FK, opened_by FK->user, opened_at, closed_at null,
               score_before numeric null, score_after numeric null,
               questions_asked int default 0
agent_message: id, session_id FK, role,      -- 'agent' | 'owner' | 'tool'
               content text, tool_name null, tool_payload jsonb null, created_at
```

### `audit_event`

```
id, business_id FK null, actor FK->user null, action text,
target text, before jsonb null, after jsonb null, at timestamptz
```

Every mutating API call writes one.

### `cost_event`

```
id, business_id FK, kind text,   -- 'ocr' | 'llm'
provider text, model text null, units int, cost_pesewas bigint, at
```

Per-business spend is a first-class metric (target ≤ 600 pesewas per completed
profile). The pipeline reads the running total and degrades to the reviewer queue
rather than exceeding a hard per-business ceiling.

### `user`

```
id, role Role, phone_hash null, email null, password_hash null,
business_id FK null,      -- owners are scoped to one business
institution_id null, is_active, last_login_at
```

---

## 4. Coverage-a derived structure, not a table

Computed in S5 and cached on `business.coverage_json`:

```json
{
	"accounts": [
		{
			"account_id": "...",
			"covered": [{ "from": "2025-09-01", "to": "2026-02-28" }],
			"holes": [{ "from": "2026-03-01", "to": "2026-03-22" }]
		}
	],
	"analysis_window": { "from": "2025-09-01", "to": "2026-08-31", "months": 12 },
	"continuous_months": 6
}
```

A hole of ≥7 consecutive days inside the analysis window raises a
`missing_period` gap carrying the exact dates the owner must re-request.
