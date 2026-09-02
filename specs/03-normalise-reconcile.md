# 03 — S4 Normalise, S5 Reconcile

Modules: `app/pipeline/s4_normalise.py`, `app/pipeline/s5_reconcile.py`

S4 turns `extraction` rows into `transaction` rows. S5 makes the multi-account,
multi-statement ledger internally consistent.

---

## S4 — Normalise

### Steps

1. **Resolve the account.** Hash the parsed account identifier
   (`sha256(identifier + PEPPER)`), look up `(business_id, identifier_hash)`,
   create if absent with `display_suffix` = last 3 digits.

2. **Create transaction rows** from `ParsedRow`. Every row MUST carry
   `provenance.extraction_ids` (INV-7).

3. **Split fees into their own transactions.** For each row with
   `fee_pesewas > 0` or `levy_pesewas > 0`, emit additional `transaction` rows:
   - fee → `direction=out`, `category_l1='opex'`, `category_l2='momo_fees'`
   - levy → `direction=out`, `category_l1='opex'`, `category_l2='elevy'`
   - Both carry `provenance` pointing at the same extraction rows and
     `flags.derived_from_composite = true`.
   The parent row's `amount_pesewas` remains the principal only.

4. **Normalise counterparty names.** Strip provider boilerplate
   (`MoMo Transfer from`, `TRF/`, `POS PURCHASE`), collapse whitespace, uppercase
   for matching, keep the original in `counterparty_raw`. Extract any MSISDN,
   hash it, store `display_suffix`.

5. **Upsert `counterparty`.** Match on `msisdn_hash` first, then exact normalised
   name, then trigram similarity ≥ 0.92 within the same business. Update
   `first_seen`, `last_seen`, `txn_count`, totals.

6. **Dates.** Convert to `Africa/Accra` calendar day for `occurred_on`. Keep the
   original timestamp in `posted_at` where the source provides one.

7. **Currency.** Any row not in GHS: `flags.fx = true`, `category_l1='unknown'`.
   Excluded from all indicators. Do not attempt conversion at MVP.

### Output
`transaction` rows with `category_l1` unset (except fee/levy rows) and
`document.status = 'extracted'`.

---

## S5 — Reconcile

Four distinct jobs. Run in this order.

### 5.1 Document-level dedupe

Two cases:

**(a) Identical file.** Handled at S1 by `sha256`.

**(b) Overlapping statement windows.** Unavoidable: MTN caps self-service
statements at 90 days, so a 12-month history is four uploads and users commonly
request overlapping ranges.

Dedupe key, in priority order:
1. `(account_id, provider_reference)` where `provider_reference` is not null.
   This is authoritative — MoMo transaction IDs are unique.
2. Fuzzy: `(account_id, occurred_on ±1 day, amount_pesewas, counterparty_hash)`.

Duplicates are marked `flags.duplicate = true` and excluded from indicators. They
are NOT deleted — the second document is legitimate evidence.

**Safety rail:** if fuzzy matching would mark more than **2% of rows** in a
document as duplicates, do not auto-apply. Raise a `gap` kind `inconsistency`,
code `AMBIGUOUS_DEDUPE`, and route to the reviewer. A business that genuinely
receives the same amount from the same customer daily must not have its revenue
halved by a fuzzy matcher.

### 5.2 Internal transfer pairing

**Why this matters:** an SME moving GH¢5,000 from MoMo to bank must not read as
GH¢5,000 revenue *and* GH¢5,000 expense. This is the highest-impact correctness
issue in the ledger.

Pair two transactions `a`, `b` when ALL hold:
- `a.direction != b.direction`
- `a.account_id != b.account_id`, both accounts belong to the same business
- `abs(a.amount_pesewas - b.amount_pesewas) <= max(a.fee_pesewas + a.levy_pesewas,
   b.fee_pesewas + b.levy_pesewas, 100)`
- `abs(a.occurred_at - b.occurred_at) <= 48 hours`

On a match: both get `flags.internal_transfer = true`,
`category_l1 = 'internal'`, `category_l2` ∈ `wallet_to_bank | bank_to_wallet |
between_own_accounts`, `category_source = 'rule'`.

Greedy matching by smallest time delta, then smallest amount delta. Each
transaction pairs at most once.

**Unpaired cash-outs.** A MoMo `Cash Out` with no matching inflow stays
`unknown` and raises a `gap` kind `unexplained_txn`, code `UNPAIRED_CASH_OUT`.
It may be a genuine cash withdrawal for stock, or a transfer to an account the
system does not know about. The agent asks.

**Targets:** recall ≥ 0.95, precision ≥ 0.98 on the labelled multi-account set.
Precision is weighted higher — wrongly deleting real revenue is worse than
leaving a transfer in.

### 5.3 Period stitching and coverage

Build a per-account day-level coverage map from all accepted statements.

```python
def build_coverage(session, business_id) -> Coverage:
    """Merge [period_start, period_end] ranges per account.
    Returns covered ranges, holes, and the largest continuous window."""
```

- Analysis window: trailing 12 months from the latest covered date. Degrade to 6,
  then 3. Record the window on every indicator.
- A hole of **≥7 consecutive days** inside the analysis window raises a `gap`
  kind `missing_period`, code `MISSING_PERIOD_MOMO` or `MISSING_PERIOD_BANK`,
  severity `major`, with `target_ref = {"account_id": ..., "from": ..., "to": ...}`.
- The gap `detail` MUST contain a literal instruction with dates the owner can act
  on: `"Request an MTN MoMo statement for 3 Feb 2026 – 3 May 2026 at
  statements.mtn.com.gh and upload it here."` Do not emit a vague "more data
  needed" message.
- Because MTN statements expire 24 hours after generation, the instruction must
  also say to upload promptly.

Write the result to `business.coverage_json`.

### 5.4 Outlier flagging

For each `category_l1`, compute the 95th percentile of `amount_pesewas`. Any
transaction exceeding `5 × p95` gets `flags.outlier = true` and raises a `gap`
kind `unexplained_txn`, code `LARGE_OUTLIER`, severity `minor`.

**Do not winsorise or exclude outliers.** Silently smoothing them hides the
one-off contract or the emergency loan that a lender most wants to see. Flag,
list, ask.

---

## Tests

- `tests/pipeline/test_s5_pairing.py` — the `adom_provisions` fixture has one
  wallet-to-bank transfer per week; all 52 must pair, and no genuine
  customer payment may be mis-paired.
- Overlapping 90-day statements covering months 1–3 and 2–4 produce one
  continuous ledger with month 2 counted once.
- A 3-week hole produces exactly one `missing_period` gap with correct dates.
- Fee splitting: a MoMo transfer of GH¢500 with GH¢7.50 fee and GH¢2.50 levy
  produces three transactions totalling GH¢510 outflow, with the principal at
  GH¢500.
