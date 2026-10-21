# Agricultural workspace validation — 21 October 2026

Implementation branch: `feat/agricultural-finance-workspace`, based on
`develop` at `edc4780`. Work was performed in an isolated Git worktree; the
original checkout and its deployment environments were not changed.

## GitHub review context

A fresh fetch before publication found GitHub `develop` at `bba3667`, 101 commits
ahead of the implementation's local base `edc4780`. Read-only merge analysis
found conflicts. The checks below cover the implementation on its recorded base;
they do not cover a merge with the newer upstream code. The draft PR requires
reconciliation and renewed regression testing before merge/deployment. See
[`docs/agriculture-review/README.md`](./docs/agriculture-review/README.md).

## Results

| Check | Result |
| --- | --- |
| Complete existing + agricultural pytest suite, Python 3.12, Postgres 16 | **81 passed**, 1 skipped |
| Separate migration-preservation test on an empty Postgres database | **1 passed** |
| Alembic upgrade through both new revisions, repeated upgrade, metadata comparison | Passed; no schema drift |
| Bun money-entry/display tests | **2 passed**, 14 assertions |
| Full frontend ESLint | Passed |
| TypeScript `tsc --noEmit --incremental false` | Passed |
| Next.js production build, `bun run build --webpack` | Passed, including all five farm routes |
| Chromium, real Better Auth signup/session/JWKS + API + Postgres | Passed |
| All five fictional businesses and poultry category differences in Chromium | Passed |
| Add GHS 0.29 expense, edit to GHS 0.49, consistent insights/report | Passed; Yaw surplus became GHS 13,749.51 |
| Printable PDF | 3 pages; edited amount, transaction references and disclosures present |
| 390px mobile viewport | No horizontal page overflow; screenshot inspected |
| `git diff --check`; new code modules under 500 lines | Passed |

The ordinary pytest run skips only the migration test when its separate empty
database URL is absent. That test was run separately and passed. Both upgrades
also succeeded from an empty database used for the browser test.

The default Turbopack build was blocked by this execution environment's local
compiler-port restriction, including an escalated attempt. The supported
Webpack production build passed. No default build/deployment setting was changed
to work around this environment-specific restriction.

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

Browser artifacts from the run are in `/private/tmp/onrecord-browser-artifacts`:
`overview-desktop.png`, `overview-mobile.png`, and `yaw-report.pdf`.

Live S3/MinIO, new OCR extraction, real OAuth-provider delivery, production
deployment, performance budgets under simulated 3G, lender sharing and
independent verification were not exercised. The Adom golden fixture and agent
red-team corpus referenced in legacy specifications are not present in this
checkout; they cannot be reported as passed.

Before rollout, apply the migrations and review legacy business associations
without an owner creation audit. See `AGRICULTURE.md` for the ownership model and
the explicit development/test demo flags.
