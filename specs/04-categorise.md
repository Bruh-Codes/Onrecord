# 04 — S6 Categorise

Module: `app/pipeline/s6_categorise.py`

Assigns `category_l1` / `category_l2` to every transaction that is not already
categorised by S4 (fees) or S5 (internal transfers).

**Design principle: categorise counterparties, not transactions.** In this market
counterparties are personal names, not merchant strings. One decision about
"KOFI MENSAH" resolves every transaction with that counterparty, now and in
future. All three tiers operate at counterparty level wherever possible.

---

## Tier 1 — Rules

`app/rules/categories/*.yaml`. Regex and keyword packs over `counterparty_raw`
and the provider transaction type.

```yaml
- id: ecg_utility
  match_any: ["ECG", "ELECTRICITY CO", "POWER DISTRIBUTION"]
  direction: out
  category_l1: opex
  category_l2: utilities
  confidence: 0.97

- id: gra_tax
  match_any: ["GRA", "GHANA REVENUE", "VAT PAYMENT"]
  direction: out
  category_l1: tax
  category_l2: vat
  confidence: 0.95

- id: susu_contribution
  match_any: ["SUSU", "DAILY COLLECTION"]
  direction: out
  category_l1: financing_out
  category_l2: susu_contribution
  confidence: 0.85
```

Required packs at MVP: utilities (ECG, GWCL), telco airtime and data, GRA,
SSNIT, MMDA permits, bank charge descriptors per bank, known susu operators, the
major FMCG distributors, and the MoMo transaction types that map deterministically
(`Airtime` → `opex.airtime_data`).

Expected coverage on MoMo data: 45–60% of transactions.

`category_source = 'rule'`.

---

## Tier 2 — kNN over counterparty embeddings

Once a counterparty has a category from any source, every future transaction with
that counterparty inherits it.

```python
def knn_categorise(session, business_id, counterparty: Counterparty) -> Suggestion | None:
    """Embed canonical_name + sector context. Search pgvector within the same
    business first, then across businesses in the same sector_code.
    Return None if best cosine similarity < 0.88."""
```

Confidence scales with the neighbour's own history depth:
`confidence = min(0.95, 0.6 + 0.05 * log2(neighbour.txn_count))`.

`category_source = 'knn'`.

Cross-business search is permitted only on the canonical name and sector, never
on amounts, and only where both businesses' owners consented to analysis. It never
copies amounts, only labels.

---

## Tier 3 — LLM tiebreak

Batched. Up to **50 distinct counterparties per call** — never per transaction.

Input per counterparty:
```json
{
  "canonical_name": "MAAME AKOSUA ENT",
  "business_sector": "retail_provisions",
  "direction_mix": {"in": 2, "out": 24},
  "amount_stats_pesewas": {"median": 20000, "min": 15000, "max": 45000},
  "frequency": "weekly",
  "first_seen": "2025-09-14", "last_seen": "2026-08-11"
}
```

Output:
```python
class CounterpartySuggestion(BaseModel):
    counterparty_id: UUID
    category_l1: str
    category_l2: str | None
    kind: CounterpartyKind
    confidence: float
    reason: str            # one line, shown to reviewer and owner
```

Sector context is what makes this work. `MAAME AKOSUA ENT` receiving GH¢200
weekly from a provisions shop is a supplier; the same name paying GH¢30 daily is
a customer. The prompt MUST supply the business sector and the direction mix.

`category_source = 'llm'`.

---

## Resolution and fallback

| Best available confidence | Result |
|---|---|
| ≥ 0.60 | Apply the category |
| < 0.60 | `category_l1 = 'unknown'`, raise `gap` kind `ambiguous_category`, code `UNCLASSIFIED_COUNTERPARTY`, `target_ref = {"counterparty_id": ...}` |

The gap is raised **once per counterparty**, not once per transaction. Its
`detail` records how many transactions and how much value it controls, which the
agent uses to prioritise (see `07-agent.md`).

---

## Priority order for conflicts

A transaction's category may be set by several sources. Precedence, highest first:

1. `human` — reviewer override
2. `owner_stated` — the agent recorded an owner's answer about a counterparty
3. `rule`
4. `knn`
5. `llm`

A lower-precedence source never overwrites a higher one. Re-running S6 is safe.

---

## `UNCLASSIFIED_RATIO`

S6 writes the indicator `UNCLASSIFIED_RATIO` (see `05-analytics.md`) =
value in `unknown` ÷ total transaction value in the window. This is the honest
measure of how much the system does not understand about this business, and it
feeds the coverage pillar of the score directly.

Post-agent-session target: ≤ 0.15 (≥85% of value classified).

---

## Cost control

- Tier 3 runs only on counterparties unresolved by Tiers 1–2.
- Batch to 50. Never call per transaction.
- Read `cost_event` running total for the business before calling. If the business
  is within 20% of its ceiling, skip Tier 3 and raise the gaps for the agent and
  reviewer instead. Degrade, do not overspend.

---

## Tests

- `tests/pipeline/test_s6_precedence.py` — an `owner_stated` category survives a
  re-run of S6 that would otherwise assign `llm`.
- Rule pack coverage on the golden MoMo corpus ≥ 45%.
- A counterparty resolved once propagates to all its transactions in one write.
- LLM tier is never called with more than 50 counterparties, and never with a
  transaction-level payload.
