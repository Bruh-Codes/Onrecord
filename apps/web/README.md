# apps/web

Next.js frontend for the Sankofa Credit Readiness Assistant. Read
[`Agent.md`](../../Agent.md) and [`specs/10-web.md`](../../specs/10-web.md)
before changing this app.

## What's built so far

All 10 owner/reviewer screens (`app/`), currently driven by mock data in
`lib/mock-data.ts` — no real API calls to `apps/api` yet. Auth is real: Better
Auth is mounted here (`lib/auth.ts`), backed by the same Postgres `apps/api`
uses. `app/signup` calls it for real email/password sign up and login.

## Auth

`lib/auth.ts` is the Better Auth server instance — Postgres via a raw `pg`
Pool, plugins `phoneNumber` (owner OTP, `sendOTP` is a console.log stub — no
SMS provider configured), `organization` (institution/reviewer membership),
`admin` (its own `role` field on `auth_user` **is** our domain `Role` enum —
`owner`/`reviewer`/`admin` — configured via `adminRoles: ["admin"]`, not a
separate custom field), and `jwt` (issues the EdDSA-signed token `apps/api`
verifies via JWKS — see `apps/api/README.md` "Auth"). `lib/auth-client.ts` is
the browser-side client; `app/api/auth/[...all]/route.ts` mounts the handler.

Every Better Auth table is prefixed `auth_` (`auth_user`, `auth_account`, …) —
`apps/api`'s own domain model already has `user` and `account` tables in the
same database, and this avoids the collision.

Required env (`.env.local`, gitignored):

```
BETTER_AUTH_SECRET=<32+ char random string>
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

Apply Better Auth's schema after any config change to `lib/auth.ts`:

```bash
bunx auth migrate -y
```

**Known gap**: ids are generated as UUIDs via a custom `advanced.database.generateId`
function (`() => crypto.randomUUID()`), not the `generateId: "uuid"` string
option — that string tells Better Auth to expect the database to
default-generate the id when the dialect natively supports UUID columns
(true for Postgres), but its own migration CLI doesn't create that DB-level
`DEFAULT`, so it silently inserted `NULL` ids until this was caught by
actually testing signup end-to-end, not just building. See the comment in
`lib/auth.ts` for detail if this surfaces again after a Better Auth upgrade.

**Known gap**: nothing writes `businessId`/`institutionId` back onto the
Better Auth user after a business/institution is created in `apps/api` — the
columns exist (`lib/auth.ts` `additionalFields`) but stay `null`, so every
JWT's `business_id`/`institution_id` claim is `null` today. Needs a decision
on which side owns that write.

## Setup

```bash
bun install
bun dev
```

Requires a reachable Postgres (see `DATABASE_URL` above) — `apps/api`'s
`README.md` has a throwaway-local-cluster recipe if you don't have one handy;
both apps can share the same database (they use non-colliding table names).

## Build

```bash
bun run build
bun run lint
```
