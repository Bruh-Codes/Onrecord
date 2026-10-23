# Farm records

OnRecord is the trusted record a lender reads, not a farm management system.
A farmer's seed purchase or market sale is the same kind of fact as a MoMo
payment, so farm activity lives in the one `transaction` ledger and flows into
Money, Business health, Loan readiness and the Lender summary. There is no
separate farm workspace and no second business: everything belongs to the
business the owner created at sign-up.

(The earlier `/farm` workspace with its own `farm_enterprise`, `farm_cycle` and
`farm_entry` tables was folded into the ledger by migration `a126003`. `/farm`
now redirects to Money.)

## Crop and season tags

`transaction.farm_activity` (crop or animal, e.g. "Tomatoes") and
`transaction.season` (e.g. "2026 main season") are optional free-text tags on
any transaction, from a statement or typed in. Owners set them when adding a
record or with "Tag" on any row of the Money page transaction list
(`PATCH /v1/transactions/{id}` with `farm_activity` / `season`; an empty string
clears a tag).

The Money page "By crop and season" section and the Lender summary show money
in, money out and what was left for each tagged pair
(`farm` in `GET /v1/businesses/{id}/money/summary`). Tapping a row filters the
whole Money page (`farm_activity` / `season` query parameters; `untagged`
matches rows without the tag). "Left over" is money in minus money out; it is
labelled as not profit. Ona answers crop and season questions with the
`get_farm_breakdown` tool.

## Records the owner types in

"Add a record" on the Money page (`POST /v1/businesses/{id}/money/records`) is
for cash sales and costs with no statement behind them. Each record:

- is an ordinary `transaction` with `category_source = owner_stated`, the plain
  label in `category_l2` (e.g. "Seeds and seedlings") mapped to the ledger
  category in `category_l1` (see `app/services/hand_entries.py`), and
  `flags.hand_entered = true`;
- belongs to one cash-book account and one `informal_ledger` document per
  business, shown in Records as "Records you typed in";
- keeps the typed values in an append-only `extraction` row
  (`extractor = owner_typed`), so `provenance.extraction_ids` is never empty
  and `provenance.value_kind = declared`.

Typed-in records are counted but never dressed up as statements:

- the readiness score already weighs `informal_ledger` value at 0.25;
- they set the analysis window so indicators are computed, but never count
  towards "unbroken statement months" (`app/services/coverage.py`);
- the Money list labels them "Typed in by you", the Lender summary lists them as
  "Records typed in by the owner" and shows how many records in each crop and
  season were typed in.

Only owners (and platform admins) can add or remove typed-in records
(`DELETE /v1/transactions/{id}` refuses statement rows).

## Demo: Yaw's tomato season

With `DEMO_MODE_ENABLED=true` on the API, an empty business's Money page offers
"Try with Yaw's tomato season (example)", which loads eight illustrative
records (land preparation, seedlings, fertilizer, labour, water, three sales;
GH¢24,200 in, GH¢10,450 out) from `app/fixtures/example_season.json` into the
signed-in business, tagged Tomatoes / 2026 main season and flagged
`example: true`. It refuses a business that already has records.

## Migration

`a126003` adds the two tag columns, copies every active `farm_entry` into the
ledger (typed-in entries become transactions on the "Records you typed in"
book with the enterprise as crop and the cycle as season; entries that pointed
at a statement transaction tag that transaction), then drops the farm tables.
Run it before deploying the API:

```sh
railway run --service project alembic upgrade head
```

Tests: `TEST_DATABASE_URL=... MIGRATION_TEST_DATABASE_URL=... uv run pytest tests/test_farm_records.py tests/test_farm_migrations.py`.

## Access

`a126001` (business_access grants) is unchanged. Reviewers still need a grant
and there is no UI to assign one yet.
