# 06-S8 Scoring, S9 Checklist

Modules: `app/pipeline/s8_score.py`, `app/pipeline/s9_checklist.py`

---

## S8-Readiness score

### What it measures

**If this file went to a loan officer today, how much would come back as
"please provide…"?**

It measures completeness and internal consistency of the file. It is NOT
creditworthiness. See INV-5. Never emit a default probability, risk grade, or
recommended loan amount.

### Rubric

`RUBRIC_VERSION = "1.0.0"`. Weights sum to 100.

| Pillar          | Weight | Components                                                                                                                                                                                |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coverage`      | 30     | continuous statement months vs required; accounts captured vs declared; `UNCLASSIFIED_RATIO` inverted; open `missing_period` gaps                                                         |
| `legibility`    | 25     | whether each core indicator could be computed at all-not whether its value is good; revenue separated from financing and owner contributions; COGS/opex split available; balances present |
| `documentation` | 30     | checklist satisfaction against the active rule pack, weighted `required` 3 : `conditional` 2 : `optional` 1                                                                               |
| `verifiability` | 15     | evidence-quality mix; reconciliation gate passes; `inconsistency` gaps subtract                                                                                                           |

### Component detail

**coverage (30)**

```
continuous_months:      12 → 20 pts, 6 → 12, 3 → 5, <3 → 0   (linear between)
accounts_captured:      captured / declared × 5 pts
unclassified:           (1 − UNCLASSIFIED_RATIO) × 5 pts
open_missing_periods:   −2 pts each, applied after the above, pillar floor 0
```

Components sum to exactly 30 before the deduction. A business with 12 continuous
months, all declared accounts captured and nothing unclassified scores the full
30-verify this in `test_s8_full_marks_reachable`. A pillar whose maximum is
unreachable is a bug.

**legibility (25)**

```
Each of these computable (not insufficient_data): 2.5 pts each, 10 codes
  REV_MONTHLY, REV_GROWTH_3M, OPEX_RATIO, OPERATING_CASHFLOW,
  AVG_DAILY_BALANCE, CASH_BUFFER_DAYS, EXISTING_DEBT_SERVICE,
  REV_CONCENTRATION, GROSS_MARGIN_PROXY, ACTIVE_TRADING_DAYS
```

**documentation (30)**

```
Σ (satisfied item weight) / Σ (all item weight) × 30
weights: required 3, conditional 2 (only if its condition evaluates true), optional 1
```

**verifiability (15)**

```
evidence mix, by share of transaction value backed by:
  bank/MoMo statement passing reconciliation ... 1.00 multiplier
  GRA e-VAT verifiable invoice ................. 1.00
  third-party printed receipt .................. 0.60
  informal_ledger (flags.low_verifiability) .... 0.25
  DECLARED only ................................ 0.00
score = weighted_share × 15
then: −3 pts per open inconsistency gap, floor 0
```

### Bands

```
0–39   not_ready
40–64  developing
65–84  nearly_ready
85–100 lender_ready
```

Boundaries are contiguous; assert this in tests.

### Attribution-required

`contributions` stores, per component:

```json
{
	"component": "coverage.continuous_months",
	"pillar": "coverage",
	"earned": 11,
	"available": 18,
	"reason": "6 continuous months of MoMo statements; 12 earns full marks"
}
```

The UI renders "You are 12 points from Nearly ready; uploading Jan–Mar MoMo
statements is worth 9 of them." That sentence is the product. A score without
attribution is not shippable.

### Reproducibility

Same inputs + same `RUBRIC_VERSION` → byte-identical `contributions`. Asserted in
`tests/pipeline/test_s8_reproducible.py`.

### Presentation constraint

Open product question, flagged in the spec, not decided here: whether the owner
sees the numeric total or only the band plus next actions. A number invites
gaming. Build the API to return both; let the frontend switch on an institution
config flag `show_numeric_score`.

---

## S9-Document checklist

### Rule packs

`app/rules/checklists/*.yaml`. Declarative, evaluated against business attributes
and the requested facility.

```yaml
rule_pack: gh_mfi_working_capital_v1
applies_when:
  product: working_capital
  amount_pesewas: { max: 20000000 } # GH¢200,000
requirements:
  - doc_type: bank_statement
    requirement: required
    constraint: { min_months: 6, must_be_continuous: true }
    accepts_also: [momo_statement, momo_merchant_statement]
    label: "Six months of bank or MoMo statements"

  - doc_type: registration_cert
    requirement: required
    accepts:
      [
        certificate_of_incorporation,
        business_registration_certificate,
        certificate_to_commence_business,
      ]
    label: "Business registration certificate"

  - doc_type: tax_doc
    requirement: required
    accepts: [tin_certificate, ghana_card]
    label: "TIN certificate or Ghana Card"

  - doc_type: tenancy_agreement
    requirement: conditional
    condition: "premises_status == 'rented'"
    label: "Tenancy agreement for your business premises"

  - doc_type: stock_list
    requirement: conditional
    condition: "sector in ['retail', 'wholesale', 'manufacturing']"
    constraint: { max_age_days: 14 }
    label: "Current stock list, not more than two weeks old"

  - doc_type: cashflow_projection
    requirement: required
    constraint: { min_months: 6 }
    generatable: true
    label: "Six-month cash flow projection"

  - doc_type: financial_statement
    requirement: optional
    label: "Audited or management accounts"
    note: "Strengthens the file but is not required at this facility size."
```

### Required seed packs

- `gh_mfi_working_capital_v1`-as above
- `gh_bank_sme_term_loan_v1`
- `gh_asset_finance_v1`-adds 3 years audited accounts, pro-forma invoice from
  an accredited dealer, and an equity contribution of 20–25%

### Condition expressions

Evaluated with a restricted evaluator (`simpleeval`), never `eval()`. Available
names: `premises_status`, `sector`, `entity_type`, `amount_pesewas`,
`employee_count_declared`, `continuous_months`. No attribute access, no calls.

### Satisfaction

An item is `satisfied` when a document of an accepted type exists, has
`status='extracted'`, and meets `constraint`. A conditional item whose condition
is false is `not_applicable` and contributes 0 to both numerator and denominator.

Each `missing` required or conditional item raises a `gap` kind
`missing_document`, severity `blocker` for `required`, `major` for `conditional`.

### Generated artefacts

Where `generatable: true`, the system drafts the document from history:

- **Cash flow projection**: built from `REV_MONTHLY`, `SEASONALITY_INDEX` and
  `OPEX_RATIO`. Presented to the owner for review and **explicit approval**.
- Stored as `DECLARED`, never `DERIVED`.
- Stamped: _"Projection prepared from transaction history. Figures are
  forward-looking estimates approved by the business owner."_
- Not marked `satisfied` until the owner approves it.

The system drafts; the owner owns. Never auto-satisfy a checklist item with a
document the owner has not seen.

---

## Gap severity mapping

| Source                                         | Kind                 | Severity  |
| ---------------------------------------------- | -------------------- | --------- |
| Missing required document                      | `missing_document`   | `blocker` |
| Missing conditional document                   | `missing_document`   | `major`   |
| Statement fails reconciliation                 | `inconsistency`      | `blocker` |
| Document reused across businesses              | `inconsistency`      | `blocker` |
| Coverage hole ≥7 days                          | `missing_period`     | `major`   |
| Unclassified counterparty                      | `ambiguous_category` | `major`   |
| Unpaired cash-out                              | `unexplained_txn`    | `major`   |
| Large outlier                                  | `unexplained_txn`    | `minor`   |
| Doc type below confidence                      | `missing_fact`       | `minor`   |
| Missing business attribute (`premises_status`) | `missing_fact`       | `minor`   |
