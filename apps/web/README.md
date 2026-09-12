# apps/web

Next.js frontend for the Onrecord Credit Readiness Assistant. Read
[`Agent.md`](../../Agent.md) and [`specs/10-web.md`](../../specs/10-web.md)
before changing this app.

## What's built so far

All 10 owner/reviewer screens (`app/`). Auth is real: Better Auth is mounted
here (`lib/auth.ts`), backed by the same Postgres `apps/api` uses.
`app/signup` calls it for real email/password sign up and login, then
`app/setup` creates the business via `apps/api` and links it to the user
(see "Auth" below).

`lib/api-client.ts` is a typed client for `apps/api` (Business + Document
endpoints-the only two resources built there so far, see the root
`ROADMAP.md`). The Documents screen (`app/(app)/(shell)/documents/`) is wired
to it end to end: `UploadDropzone` does a real upload (hash → presigned PUT →
complete) and the "Your uploads" list reads real documents back. Every other
screen (Overview, Counterparties, Gaps, Nearly-ready, Reviewer) still runs on
`lib/mock-data.ts` / `lib/derived.ts`-their backing endpoints
(coverage/indicators/score/checklist/gaps/review queue) are Phase 2 work, not
built yet.

## Auth

`lib/auth.ts` is the Better Auth server instance-Postgres via a raw `pg`
Pool, plugins `phoneNumber` (owner OTP, `sendOTP` is a console.log stub-no
SMS provider configured), `organization` (institution/reviewer membership),
`admin` (its own `role` field on `auth_user` **is** our domain `Role` enum —
`owner`/`reviewer`/`admin`-configured via `adminRoles: ["admin"]`, not a
separate custom field), and `jwt` (issues the EdDSA-signed token `apps/api`
verifies via JWKS-see `apps/api/README.md` "Auth"). `lib/auth-client.ts` is
the browser-side client; `app/api/auth/[...all]/route.ts` mounts the handler.

Every Better Auth table is prefixed `auth_` (`auth_user`, `auth_account`, …) —
`apps/api`'s own domain model already has `user` and `account` tables in the
same database, and this avoids the collision.

Required env (`.env.local`, gitignored):

```
BETTER_AUTH_SECRET=<32+ char random string>
BETTER_AUTH_URL=http://localhost:3000
# Server-only; do not prefix with NEXT_PUBLIC_. It is used by Better Auth on Vercel.
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
# Password-reset emails (Better Auth sendResetPassword → Resend). Unset key =
# the reset link is only logged to the server console (local dev fallback);
# with a key, RESEND_FROM_EMAIL must be a sender verified on Resend.
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Onrecord <no-reply@your-domain.com>
```

Password reset: `/forgot-password` requests a one-hour, single-use token via
`authClient.requestPasswordReset`; Better Auth hands the reset URL to
`emailAndPassword.sendResetPassword`, which sends it through
`lib/resend.ts`. The emailed link first hits `/api/auth/reset-password/<token>`
(validates the token server-side), then redirects to `/reset-password?token=…`,
the new-password form, which calls `authClient.resetPassword`. Unknown emails
get the identical "if this email exists…" response, so the endpoint can't be
used to probe for registered accounts.

Signed-in users can also change their password from the profile dropdown
(topbar) → "Change password", which calls `authClient.changePassword`
(`revokeOtherSessions: true`, so other devices are signed out). Accounts created
via Google have no password to change — that case is reported instead of
failing silently.

Apply Better Auth's schema after any config change to `lib/auth.ts`:

```bash
bunx auth migrate -y
```

**Known gap**: ids are generated as UUIDs via a custom `advanced.database.generateId`
function (`() => crypto.randomUUID()`), not the `generateId: "uuid"` string
option-that string tells Better Auth to expect the database to
default-generate the id when the dialect natively supports UUID columns
(true for Postgres), but its own migration CLI doesn't create that DB-level
`DEFAULT`, so it silently inserted `NULL` ids until this was caught by
actually testing signup end-to-end, not just building. See the comment in
`lib/auth.ts` for detail if this surfaces again after a Better Auth upgrade.

~~**Known gap**: nothing writes `businessId`/`institutionId` back onto the
Better Auth user~~-**resolved for the owner/business path**: `/setup`
(new users land here right after signup) calls `POST /v1/businesses` then
`lib/link-business.ts` writes the returned id onto `auth_user` directly,
through the same `pg.Pool` Better Auth itself uses (not `auth.api.updateUser`
— `businessId`/`institutionId` are deliberately `input: false`, so a
trusted server-side write goes around that guard rather than through it).
The `(app)/layout.tsx` guard sends any owner with no `businessId` to `/setup`.
**Still open**: the institution/reviewer side-there's no
institution-creation UI anywhere in this app yet to call the equivalent write
from, so `institution_id` stays `null` on reviewer/admin tokens.

## Setup

```bash
bun install
bun dev
```

Requires a reachable Postgres (see `DATABASE_URL` above)-`apps/api`'s
`README.md` has a throwaway-local-cluster recipe if you don't have one handy;
both apps can share the same database (they use non-colliding table names).
Or run `docker compose up` from the repo root for the backend
(Postgres/Redis/MinIO/api/worker) and run the web with `bun dev` pointing at it
via `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`-see the root
[`README.md`](../../README.md) "Docker Compose".

## Build

```bash
bun run build
bun run lint
```

## Deploying to Vercel

`vercel.json` in this directory pins the framework (Next.js) and the build
commands. Create the Vercel project with:

- Framework preset: **Next.js**
- Root directory: **`apps/web`** (monorepo)
- Build: `bun run build` (bun installs automatically from the
  `packageManager` field)

Environment variables (Vercel → Settings → Environment Variables):

```
BETTER_AUTH_SECRET=<32+ char random string, stable across deploys>
BETTER_AUTH_URL=https://<your-app>.vercel.app
DATABASE_URL=postgresql://...railway...     # Public Network DSN from Railway Postgres → Connect
NEXT_PUBLIC_BACKEND_URL=https://sme-project-production-9437.up.railway.app
RESEND_API_KEY=re_...                        # password-reset email delivery
RESEND_FROM_EMAIL=Onrecord <no-reply@your-domain.com>  # verified sender
```

The browser talks to the Railway API directly (CORS), so the API's
`CORS_ALLOW_ORIGINS`, `BETTER_AUTH_ISSUER`, `BETTER_AUTH_AUDIENCE` and
`BETTER_AUTH_JWKS_URL` must each point at the Vercel domain.

First deploy creates the app but the Better Auth tables (`auth_user`, …) have
not been created yet in the production database. Run once against your
production database (from a shell with `DATABASE_URL` set to the public DSN):

```bash
bunx auth migrate
```
