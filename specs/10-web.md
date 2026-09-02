# 10 — Web

Module: `web/` — Next.js 15, App Router.

Two audiences with opposite constraints. The owner is on a mid-range Android
phone, 3G, metered data, possibly low digital literacy. The reviewer is at a desk
on a laptop. Do not build one interface for both.

---

## 1. Performance budget — owner routes

Non-negotiable, enforced in CI with Lighthouse:

| Metric | Budget |
|---|---|
| JS shipped to an owner route | ≤ 120 KB gzipped |
| LCP on simulated 3G | ≤ 3.0 s |
| Images | AVIF/WebP, lazy, explicit dimensions |

Owner routes are server components with form actions wherever possible. Client
components only where interaction genuinely requires them: the camera capture
widget, the agent chat stream, the upload progress list.

Reviewer routes may ship more; they are not on the budget.

---

## 1a. Auth

Better Auth is mounted here (`apps/web/app/api/auth/[...all]/route.ts`), Postgres-backed
via its adapter. `apps/api` never issues or checks credentials — it only verifies
the JWT Better Auth issues (see `specs/09-api.md` §1). Plugins in use: `phoneNumber`
(owner OTP login), `organization` (institution/reviewer membership + role),
`jwt` (token for `apps/api` to verify), `admin` (reviewer/admin management).

The current `apps/web` build (`/signup`) implements a placeholder email/password +
Google card with no real backend yet; wiring it to Better Auth — including
switching the owner flow to phone + OTP per the routes below — is open work
(see `ROADMAP.md`, Phase 1).

---

## 2. Owner routes

```
/                          → phone entry
/verify                    → OTP entry
/setup                     → business basics (name, type, sector, premises)
/upload                    → the core screen
/upload/guide/momo         → the MTN 90-day statement walkthrough
/profile                   → score, band, next actions
/profile/indicators        → the numbers, drill to source
/chat                      → gap agent session
/documents                 → what has been uploaded, status per document
/share                     → generate and manage a lender link
```

### `/upload` — the screen that determines completion rate

- Camera capture with a live edge-detection overlay and a "hold steady" hint.
  Reject and re-prompt client-side on blur before upload: computing variance of
  Laplacian on a downscaled frame is cheap and saves a round trip on 3G.
- Multi-select from gallery, queued, resumable, showing per-file progress.
- Each uploaded document shows its live pipeline status in plain words:
  "Reading your statement…" → "Checking the numbers add up…" → "Done".
  Never expose stage codes to owners.

### `/upload/guide/momo` — a required, not optional, flow

MTN caps self-service statements at 90 days and expires them 24 hours after
generation. This screen must:

1. Read `coverage.holes` and compute the exact date ranges still needed.
2. Present them **one at a time**, with the literal dates to enter:
   > "Step 1 of 3. Go to statements.mtn.com.gh, sign in, and request a statement
   > for **3 February 2026 to 3 May 2026**. Come back and upload it here.
   > The statement expires 24 hours after MTN sends it, so upload it today."
3. Track which ranges have been satisfied and advance.

This flow is the single biggest drop-off risk in the product. Treat it as a
first-class feature, not a help page.

### `/profile`

- Band as the primary element. Numeric total shown only if the institution config
  flag `show_numeric_score` is true (see `06-scoring-checklist.md`).
- Below it, the attribution sentence, generated from `contributions`:
  > "You are 12 points from Nearly ready. Uploading your January–March MoMo
  > statements is worth 9 of them."
- Then the ranked next actions, each linking to the action that resolves it.
- `DECLARED` values render with a visible "you told us this" treatment.

### `/chat`

- SSE stream. One question visible at a time.
- Tool calls render as a short status line ("Updating 40 transactions…"), not raw
  JSON.
- After each answer, show the score delta if it moved.
- Hard stop at 15 questions with a summary and a "continue" action.

---

## 3. Reviewer routes

```
/review                    → queue, filterable by business, severity, age
/review/{itemId}           → side-by-side: page crop from bbox | extracted field
/review/business/{id}      → full profile, transaction ledger, gap list
/review/business/{id}/ledger → paginated, filterable transaction table
/admin/rule-packs          → upload/edit checklist and category YAML
```

### `/review/{itemId}` — the resolution screen

- Left: the page render, zoomable, with the `bbox` highlighted.
- Right: the extracted value, editable, with the confidence and extractor shown.
- Resolving writes a new `extraction` row; the previous value stays visible as
  "originally read as …". Never hide what the machine first saw.
- Keyboard-first: `j`/`k` to move, `Enter` to accept, `e` to edit.

### Ledger table
`font-variant-numeric: tabular-nums` on every money column. Money right-aligned,
formatted `GH¢1,234.56`. Flag chips for `outlier`, `duplicate`,
`internal_transfer`, `suspect`.

---

## 4. Shared rules

- **Money formatting** lives in one module, `web/lib/money.ts`, which takes
  integer pesewas. No component divides by 100 inline.
- **`insufficient_data`** renders as its reason string, never as `0`, `—`, or
  blank.
- **No browser storage** for anything that must survive. Session state is server
  side; `localStorage` only for a remembered filter or an unsent chat draft, in
  try/catch.
- **Offline tolerance**: uploads queue and retry. A dropped connection mid-session
  must not lose an in-progress agent answer.
- **Copy**: name things as the owner recognises them. "Money in" not "inflows".
  "Money you took for yourself" not "drawings". Errors say what happened and what
  to do.

---

## 5. Accessibility

- Every interactive element keyboard reachable with a visible focus state.
- Contrast ≥ 4.5:1 for body text.
- Charts always accompanied by their tabular figures — a chart is never the only
  representation of a number.
- Form fields labelled, errors associated with `aria-describedby`.
- Respect `prefers-reduced-motion`.
