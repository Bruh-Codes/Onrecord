# Agricultural workspace validation — 22 October 2026

Implementation branch: `feat/agricultural-finance-workspace`, originally built
on `develop` at `edc4780`, now merged with GitHub `develop` at `311dba9`
(including #111 AI document ingestion, #112 Ona on Claude and #113 Money).

## Upstream integration

Merging `develop` produced seven conflicts: `.env.example`, `api/main.py`,
`routers/businesses.py`, the dashboard page, `AgentDockHost.tsx`, `Sidebar.tsx`
and `MobileNav.tsx`. All `develop` behavior was kept, including the Google
Sheets import (`app/api/integrations/google-sheets/*`, `components/integrations/*`,
`lib/google-sheets*.ts`), the Money page, document review and Ona on Claude.
Farm additions were layered on top:

- Routers: `develop`'s money/voice routers plus the agriculture/farm-options routers.
- Navigation: Money and Farm both appear; the mobile bar now has seven tabs
  (about 53px each at 375px, above the 44px minimum).
- Dashboard: the farm workspace card sits above `develop`'s Get Started card
  with its Google Sheets slot.
- Ona: `develop`'s Claude dock is unchanged except that it is hidden on `/farm`
  (it is not yet grounded in the farm ledger) and excluded from farm printouts.

Integration fixes required by the combined code:

- **Migration order.** `a126001` and `develop`'s `a2b4c6d8e0f1` both descended
  from `f1a7b9c3d5e7`, giving two Alembic heads. `a126001` now descends from
  `a2b4c6d8e0f1`; there is a single head (`a126002`). The migration
  preservation test now seeds legacy data at `a2b4c6d8e0f1`.
- **Account deletion.** `develop`'s complete account deletion did not know about
  farm tables. It now removes `farm_entry`, `farm_cycle`, `farm_enterprise`,
  `business_task` and `business_access` rows before the rows they reference,
  and it requires an explicit OWNER grant instead of the JWT business claim,
  consistent with this branch's access model. A regression test covers deleting
  an account with farm records.
- **Access grants in new tests.** `develop`'s document-review, Ona-tools and
  fn-data tests created businesses as an admin and relied on the owner's JWT
  claim. Under this branch's explicit grants, they now create the business as
  the owner, matching how existing tests were adapted.
- **Counterparty removal.** `develop` removed `counterparty_raw` from the
  transaction API; the farm source-transaction picker now labels rows by
  category, falling back to direction.

## Results on the combined version

| Check | Result |
| --- | --- |
| Complete backend pytest suite, Python 3.12, Postgres 16, Redis | **162 passed**, 2 failed (see below) |
| Migration preservation test on a separate empty Postgres database | **1 passed** |
| `alembic heads` | Single head, `a126002` |
| Bun money-entry/display tests | **2 passed**, 14 assertions |
| TypeScript `tsc --noEmit --incremental false` | Passed |
| Next.js production build, `bun run build --webpack` | Passed: five farm routes, Google Sheets API routes and `/money` |
| Frontend ESLint | 6 errors, 1 warning, **all pre-existing on `develop`** (see below) |
| Chromium smoke: Better Auth signup through `/setup`, all five profiles, GHS 0.29 → 0.49 edit, insights/report totals, PDF, 390px viewport | **Passed**; screenshots and sample PDF refreshed |

Notes on the non-passing rows:

- `test_farm_migrations.py` fails by design inside the ordinary suite once its
  database has been migrated; it refuses non-empty databases. Run on its own
  against a fresh empty database, it passes.
- `test_fn_data_upload.py` also fails on unmodified `develop` (`311dba9`) at the
  same step: the local upload URL returns 404. It is not introduced by this branch.
- ESLint on unmodified `develop` reports 9 problems (8 errors). The combined
  version reports 7 (6 errors), all in files owned by `develop`
  (`documents/page.tsx`, `setup/page.tsx`, `AgentDockHost.tsx`,
  `GoogleSheetReplacement.tsx`, `Sidebar.tsx`, `agent-dock.tsx`); farm code
  adds none.
- The build needs `DATABASE_URL` set to collect Better Auth page data; it was
  run with a disposable test database URL and placeholder auth secret.

The browser smoke test now follows `develop`'s onboarding: the signup page
stores the pending credentials and `/setup` creates the Better Auth account and
the business together, so the script stages the pending signup the same way
instead of calling the sign-up endpoint directly. No auth step is bypassed.
It ran against the production build (`NEXT_PUBLIC_BACKEND_URL=/backend`) and
the API on a fresh database migrated through the re-parented revisions. The
screenshots and sample PDF in `docs/agriculture-review/` are from this run and
show `develop`'s Money item next to Farm; Yaw's surplus is GHS 13,749.51 after
the edit.

## Covered acceptance behavior

- Maize, poultry, aquaculture, cocoa, tomato and mixed-farm totals match the
  checked-in fixtures exactly to the pesewa.
- Shared overhead contributes once to consolidated totals and stays excluded
  from enterprise/cycle scopes.
- Farm entry changes affect the same calculation service used by reports.
  Deletions retain audit history; source values/provenance are preserved.
- Cross-owner business/report reads, entry mutations, source/evidence links,
  transaction detail/classification and task-result access are denied.
- Reviewers without explicit business grants are denied. Platform-admin access
  remains intentionally privileged.
- Invalid monetary values, mismatched cycles/categories, missing evidence and
  duplicate source allocations are rejected or disclosed appropriately.
- An unfinished upload cannot become an attachment. Upload completion rejects
  mismatched bytes; linking a confirmed receipt keeps its amount self-reported.
  Deleting that receipt restores the missing-evidence warning without losing
  the farm entry.
- Demo import is idempotent, owner-isolated and rejected in production even
  when the demo flag is enabled. Fixture evidence markers do not become fake
  attachments.

## Artifacts and limits

Browser artifacts from the combined-version run are checked in under
`docs/agriculture-review/`: `overview-desktop.png`, `overview-mobile.png`, and
`sample-report-after-edit.pdf`.

Live S3/MinIO, new OCR extraction, real OAuth-provider delivery, production
deployment, performance budgets under simulated 3G, lender sharing and
independent verification were not exercised. The Adom golden fixture and agent
red-team corpus referenced in legacy specifications are not present in this
checkout; they cannot be reported as passed.

Before rollout, apply the migrations and review legacy business associations
without an owner creation audit. See `AGRICULTURE.md` for the ownership model and
the explicit development/test demo flags.
