# 05 — S7 Analytics

Module: `app/pipeline/s7_analyse.py`

Pure, deterministic, versioned. No LLM call in this stage, ever.

---

## Contract

```python
FORMULA_VERSION = "1.0.0"

class Indicator(Protocol):
    code: str
    unit: Literal["pesewas", "ratio", "days", "count", "index", "months"]
    min_months: int                # below this, emit insufficient_data

    def compute(self, ctx: AnalysisContext) -> IndicatorValue: ...

class AnalysisContext:
    business_id: UUID
    window_start: date
    window_end: date
    months: list[str]              # ["2025-09", ..., "2026-08"], complete months only
    txns: list[Transaction]        # pre-filtered, see §2
    coverage: Coverage

class IndicatorValue(BaseModel):
    value: dict                    # {"v": n} | {"series": [...]} | {"status": "insufficient_data", "reason": str}
    inputs: dict                   # {"transaction_ids": [...]} or {"indicator_codes": [...]}
```

Every indicator writes an `indicator` row carrying `inputs`. A figure that cannot
name its inputs is a bug (INV-7).

---

## 1. Analysis window

Default: trailing 12 complete months from the latest covered date. Degrade to 6,
then 3. The window used is recorded on every row. An indicator whose `min_months`
exceeds the available window returns
`{"status": "insufficient_data", "reason": "requires 6 complete months, have 4"}`
rather than a misleading number.

## 2. Transaction filter

Applied before any indicator runs. Exclude a transaction if ANY of:
- `flags.duplicate` is true
- `flags.internal_transfer` is true
- `flags.fx` is true
- `flags.reversal` is true, and its paired original
- `occurred_on` outside the window

`unknown` transactions are NOT excluded — they are needed by `UNCLASSIFIED_RATIO`,
but they contribute to no revenue or expense aggregate.

## 3. Aggregate shorthand

For month `m`:
- `R_m` = Σ `amount_pesewas` where `direction=in` and `category_l1='revenue'`
- `E_m` = Σ where `direction=out` and `category_l1 ∈ {cogs, opex, tax}`
- `COGS_m`, `OPEX_m`, `FIN_IN_m`, `FIN_OUT_m`, `DRAW_m` likewise by `category_l1`

`financing_in` is not revenue. `owner_contribution` is not revenue. Enforced by
the filter above and asserted in tests.

---

## 4. The 18 indicators

| Code | Unit | min_months | Definition |
|---|---|---|---|
| `REV_MONTHLY` | pesewas | 1 | Series of `R_m` |
| `REV_TTM` | pesewas | 3 | `Σ R_m`. If window < 12 months, annualise and set `value.annualised = true` |
| `REV_GROWTH_3M` | ratio | 6 | `(Σ last 3 R_m) / (Σ prior 3 R_m) − 1`. If denominator is 0, `insufficient_data` |
| `REV_VOLATILITY` | ratio | 6 | Population coefficient of variation `σ(R_m) / mean(R_m)`. Flag if > 0.6 |
| `REV_CONCENTRATION` | ratio | 3 | `{"top1": s₁, "top3": Σs₁₋₃, "hhi": Σsᵢ²}` over revenue counterparties. Flag if `top3 > 0.5` |
| `SEASONALITY_INDEX` | index | 12 | Series of `R_m / mean(R_m)` per calendar month |
| `ACTIVE_TRADING_DAYS` | count | 1 | Series: distinct days per month with ≥1 revenue transaction |
| `CUSTOMER_COUNT` | count | 1 | Series `{"total": n, "new": n, "returning": n}` of distinct revenue counterparties |
| `AVG_TICKET` | pesewas | 1 | `R_m ÷ count(revenue transactions in m)` |
| `OPEX_RATIO` | ratio | 3 | `mean(E_m) / mean(R_m)` |
| `GROSS_MARGIN_PROXY` | ratio | 6 | `(mean(R_m) − mean(COGS_m)) / mean(R_m)`. **Emit only if** ≥60% of outflow value in the window is categorised AND `mean(COGS_m) > 0`; else `insufficient_data` |
| `NET_CASHFLOW` | pesewas | 1 | Series `R_m + FIN_IN_m − E_m − FIN_OUT_m − DRAW_m` |
| `OPERATING_CASHFLOW` | pesewas | 1 | Series `R_m − E_m`. Excludes financing and owner draws |
| `AVG_DAILY_BALANCE` | pesewas | 3 | Mean end-of-day aggregate balance across accounts. Requires `balance_after_pesewas`; forward-fill within a covered range, never across a hole |
| `NEGATIVE_BALANCE_DAYS` | count | 3 | Days where aggregate end-of-day balance ≤ 0 |
| `CASH_BUFFER_DAYS` | days | 3 | `AVG_DAILY_BALANCE ÷ (Σ E_m × 12 / 365)`. If daily outflow is 0, `insufficient_data` |
| `EXISTING_DEBT_SERVICE` | ratio | 3 | `mean(FIN_OUT_m) / mean(R_m)` |
| `DSO_PROXY` | days | 3 | Mean days from an `invoice_issued` date to a settlement inflow matched on amount ±1% and counterparty. Only where invoices were uploaded; else `insufficient_data` |
| `UNCLASSIFIED_RATIO` | ratio | 1 | Value in `unknown` ÷ total transaction value in window |
| `AFFORDABILITY_HEADROOM` | pesewas | 6 | `mean(OPERATING_CASHFLOW) × HAIRCUT`. `HAIRCUT` defaults to 0.5 and is an institution-level config value, not a constant |

That table lists 20 codes; `REV_MONTHLY` and `REV_TTM` count as one indicator
family in the product copy. Implement all 20.

### `AFFORDABILITY_HEADROOM` — mandatory handling

This is the only output that resembles a lending figure. It MUST:
- be labelled "indicative monthly repayment capacity" in every surface
- carry the caption "This is not a lending decision or a credit assessment"
- never be presented as an approved or recommended amount
- read `HAIRCUT` from institution config, never a hardcoded literal

See INV-5.

---

## 5. Outliers

Transactions flagged `outlier` in S5 are **included** in all aggregates. They are
listed separately in the export so a reader can see them. Do not exclude, do not
winsorise.

---

## 6. Determinism requirements

- Integer arithmetic throughout. Ratios computed as `Fraction` or float only at
  the final division, rounded to 4 decimal places for storage.
- No dict iteration order dependence.
- Same inputs + same `FORMULA_VERSION` → byte-identical `value_json`. Asserted in
  `tests/pipeline/test_s7_determinism.py` by computing twice and comparing.

---

## 7. Regression fixture

`tests/fixtures/adom_provisions.py` — a hand-authored 12-month ledger for a
provisions retailer with known-correct expected values for all 20 codes.
It contains, deliberately:

- a December revenue spike (seasonality ≈ 1.8×)
- one wallet-to-bank transfer per week (52 pairs to detect)
- an existing susu loan with monthly `financing_out`
- one GH¢18,000 one-off contract (outlier, must not be smoothed away)
- a 3-week statement hole in March
- 8% of counterparties deliberately ambiguous
- a loan disbursement that must NOT be counted as revenue

Every expected value is checked in as a fixture constant. **If you change a
formula, the fixture's expected values change in the same commit, deliberately
and with a note saying why.** Do not adjust the fixture to make a test pass.
