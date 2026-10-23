# 12 — Farm records

Farm activity is not a separate record book. Sales and costs are ordinary
`transaction` rows, optionally tagged with `farm_activity` (crop or animal) and
`season`, so they reach Money, Business health, Loan readiness and the Lender
summary like any other record. See `../AGRICULTURE.md` for the model, the
"Add a record" flow, the demo and migration `a126003`.

Records the owner types in are `owner_stated` transactions on the business's
"Records you typed in" `informal_ledger` document, each backed by an append-only
`extraction` row. They are labelled as typed in wherever they are shown, weigh
0.25 in the readiness evidence mix, and never count as statement coverage.

There is one business per owner, created at sign-up; farm features never ask
the owner to pick or create another.
