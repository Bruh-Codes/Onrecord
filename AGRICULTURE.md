# Agricultural finance workspace

Executed checks and limits: [AGRICULTURE_VALIDATION.md](./AGRICULTURE_VALIDATION.md).

The workspace extends the existing Next.js/FastAPI application at `/farm`.
It preserves Better Auth, the extracted transaction ledger, document processing,
readiness calculations, and existing routes. No new service is required.

## Data and financial boundaries

`business → farm_enterprise → farm_cycle → farm_entry`

- A manual `farm_entry` is a **declared**, self-reported record. Its positive
  integer `amount_pesewas` never enters the existing `transaction`, `indicator`
  or `readiness_score` tables.
- An allocated source entry references an existing extracted transaction and
  stores no duplicate monetary amount. Its amount, date, fees and levies are
  read from that source. Only active, classified operating transactions may be
  allocated. A partial unique index prevents one source being counted twice.
- Matching a manual entry to a source uses the entry edit form. It replaces the
  manual amount with a source reference, retaining the original values in the
  audit event. Suspected duplicates are warnings, not fraud findings.
- Gross receipts, recorded expenditures and recorded operating surplus use one
  server-side calculation service shared by overview, insights and reports.
  Fees and levies are included once as costs, including fees on incoming sales.
- Source subtotals remain visible separately. A combined record summary is not
  an evidence-derived indicator, net profit, an audited statement or a lending
  decision. No AI-generated financial narrative or score is introduced.
- Shared overhead is explicitly unallocated. It contributes once to business
  totals and is excluded from enterprise/cycle views, with a disclosure.
- Evidence means an active document in the same business actually exists.
  Upload completion checks stored bytes, size and SHA-256 before confirming a
  document; an uncompleted upload reservation cannot become farm evidence.
  Neither an attachment nor existing AI/reviewer scoring eligibility becomes
  an independent-verification claim. Deleted evidence loses its attachment
  status; deleted/excluded source transactions leave farm totals.
- Entry edits and soft deletions write before/after audit events. Source
  transaction values and original documents are retained.

The supported templates cover tomato, maize, rice, cassava, cocoa, other crops,
broilers, layers, goats, cattle, other animals, tilapia, catfish and other fish.
Area fields use explicit acres/hectares; cycle metadata has validated batch and
pond quantities. Monetary inputs use integer pesewas throughout.

## Authorization and migration

Apply both new Alembic revisions before serving this version:

```sh
cd apps/api
.venv/bin/alembic upgrade head
```

`a126001` adds explicit `business_access` grants and owned task references.
Existing ownership is backfilled from `business.create` audit events whose
actor is an owner. A selected business ID or stale JWT business claim does not
grant access. Owners and reviewers require explicit grants; platform admins
retain administrative access. Reviewer assignment/sharing UI remains future work.
Only owners/platform admins may change farm records.

Legacy associations without a corroborating owner creation event are deliberately
not auto-granted. Before rollout, inspect these associations and establish
ownership with the account owner; an administrator can then add a business access
grant. Do not bulk grant access based solely on existing `auth_user.businessId`.
New business creation establishes ownership and both active-business associations
in the normal application flow. Business switching uses an authorized endpoint.

`a126002` adds agricultural tables and fictional-business markers. Existing
businesses default to real (`is_demo=false`); the migration does not alter the
extracted ledger or seed farm data. Both upgrades are additive. A migration test
checks preservation and compares the resulting schema with the ORM metadata.

Transaction detail/update authorization is now awaited. Document authorization
uses the same business grants. Task status is available only when its stored
business is accessible. Tasks queued before this version have no ownership
reference and return 404 from the task-status endpoint.

## Run and demonstrate

Use the existing README setup for Postgres, API, Better Auth and the frontend.
Create a business normally, then open **Farm finances** from the sidebar or
**Farm** from mobile navigation. Add an enterprise, create a cycle, record a sale
or expense, and open **Insights** or **Finance report**. The report supports the
browser's Print / Save PDF and a CSV export of the exact displayed record scope.

To enable the fictional demo in a development/test environment, set these on
the API (never on the browser):

```dotenv
ENVIRONMENT=development
DEMO_MODE_ENABLED=true
```

Production environments reject the demo-import endpoint even when the second
flag is accidentally enabled. With demo enabled, **Try Yaw's tomato demo** is
one click from `/farm` and two from the existing dashboard. It creates five
owner-isolated fictional businesses, selects Yaw and reuses ordinary persistence
and authorization. Repeating the import does not duplicate or overwrite entries.
It does not reset entries the demonstrator has edited/deleted.

The bundled JSON fixtures are authoritative. Their old `attached` markers have
no corresponding receipt files, so the importer correctly marks every sample
entry unsupported. Original fixture metadata is retained for traceability.

| Fictional business | Gross receipts GHS | Expenditures GHS | Recorded surplus GHS |
| --- | ---: | ---: | ---: |
| Yaw Mensah Farms | 24,200.00 | 10,450.00 | 13,750.00 |
| Akosua Mixed Farm | 18,000.00 | 6,270.00 | 11,730.00 |
| Ibrahim Poultry | 7,250.00 | 4,480.00 | 2,770.00 |
| Esi Fish Farm | 10,800.00 | 6,650.00 | 4,150.00 |
| Abena Cocoa Growers | 8,400.00 | 2,250.00 | 6,150.00 |

Ona's existing scripted walkthrough remains available on its existing screens;
it is hidden on farm routes so it cannot imply grounded agricultural advice.

## Verification

Use a **disposable** Postgres database with a name ending in `_test`. API fixtures
create/drop domain tables only when `TEST_DATABASE_URL` is explicitly supplied.
They never inherit a developer or production `DATABASE_URL`.

```sh
cd apps/api
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/onrecord_test .venv/bin/python -m pytest -q
```

The migration test additionally requires a separate **empty** database; it
refuses to clear a populated database. Use a fresh database for each run:

```sh
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/onrecord_test MIGRATION_TEST_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/onrecord_migration_test .venv/bin/python -m pytest tests/test_farm_migrations.py -q
```

Frontend checks:

```sh
cd apps/web
bun run test
bun run lint
bun run build
```

In environments that block Turbopack's local compiler port, the equivalent
production build can be checked with `bun run build --webpack`.

`apps/api/tests/browser/smoke_farm.py` exercises normal signup/onboarding, the
persisted demo, transaction creation/editing, matching insights/report totals,
PDF output and a 390px viewport. Run only with local test servers and a disposable
database containing domain and Better Auth schemas. The test helper
`apps/web/scripts/prepare-browser-auth.ts` uses Better Auth's migration engine and
rejects database names without `_test`. Set `ONRECORD_SMOKE_URL` (defaults to
`http://localhost:3300`) and `CHROME_BINARY`, then run the Python smoke script.
It creates fictional test accounts and writes screenshots/PDFs under
`/private/tmp/onrecord-browser-artifacts` by default.

Receipt linking/upload reuses existing storage and document processing. External
S3/OCR/provider integrations, real Google OAuth delivery, lender sharing,
independent verification, multi-user assignment UI and credit decisions are not
newly implemented or validated by these farm tests.
