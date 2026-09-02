# apps/api

FastAPI + Celery backend for the Onrecord Credit Readiness Assistant. One image,
two entrypoints — see `Dockerfile`. Read [`Agent.md`](../../Agent.md) and
[`specs/00-domain-model.md`](../../specs/00-domain-model.md) /
[`specs/09-api.md`](../../specs/09-api.md) before changing this app.

## What's built so far

Domain model (all tables from `specs/00-domain-model.md`), the `Business` and
`Document` resource endpoints from `specs/09-api.md` §2, JWT verification for
Better-Auth-issued tokens (EdDSA via Better Auth's JWKS endpoint — see Auth
below), and the Celery worker skeleton. The S1–S10 pipeline, the agent, scoring,
and export are not built yet (see `../../ROADMAP.md`).

## Auth

`apps/api` holds no credentials and issues nothing. Better Auth (`apps/web`)
signs tokens with its `jwt` plugin, which defaults to **EdDSA/Ed25519**, not a
shared secret. `apps/api` verifies each request by fetching Better Auth's public
keys from its JWKS endpoint (`GET {BETTER_AUTH_URL}/api/auth/jwks`) via
`PyJWKClient` (`app/api/deps.py`) — no secret to configure or rotate on this
side. Custom claims (`role`, `business_id`, `institution_id`) must be added on
the Better Auth side via the `jwt` plugin's `definePayload` option; without
that, tokens verify but `verify_token` has nothing to build `Claims` from.

## Setup

Requires Python 3.12, a Postgres 16 instance, and Redis (Redis only needed to
run the worker — the API and its tests don't touch it).

```bash
cd apps/api
uv venv --python 3.12
uv pip install -e ".[dev]"
```

Create `.env` (not committed):

```
DATABASE_URL=postgresql+asyncpg://sme:sme@localhost:5432/sme
DATABASE_URL_SYNC=postgresql+psycopg://sme:sme@localhost:5432/sme
REDIS_URL=redis://localhost:6379/0
BETTER_AUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
BETTER_AUTH_ISSUER=http://localhost:3000
BETTER_AUTH_AUDIENCE=http://localhost:3000
```

## Run migrations

```bash
.venv/Scripts/alembic upgrade head      # Windows
.venv/bin/alembic upgrade head          # macOS/Linux
```

New model change → new migration in the same commit (Agent.md §7.4):

```bash
alembic revision --autogenerate -m "add whatever"
```

Autogenerate needs a real Postgres to diff against — SQLite is not a substitute
(no native enums/jsonb). If you don't have one handy, a throwaway local cluster
works fine for generating a migration:

```bash
initdb -D /tmp/pgdata -U sme --pwfile=<(echo sme) -A md5
pg_ctl -D /tmp/pgdata -o "-p 5433" start
createdb -h localhost -p 5433 -U sme sme
```

## Run the API

```bash
.venv/Scripts/uvicorn app.api.main:app --reload   # Windows
.venv/bin/uvicorn app.api.main:app --reload        # macOS/Linux
```

`GET /healthz` for a liveness check, `GET /docs` for the OpenAPI UI.

## Run the worker

```bash
.venv/Scripts/celery -A app.workers.celery_app worker --loglevel INFO
```

Only a placeholder `ping` task exists so far — proves the entrypoint boots and
reaches Redis. Real pipeline tasks land in `app/workers/tasks.py` as each S1–S10
stage is built.

## Tests

```bash
.venv/Scripts/python -m pytest
```

DB-backed tests need a reachable `DATABASE_URL` and skip cleanly with a reason
if one isn't available. They create and drop their own tables per test — don't
point `DATABASE_URL` at a database with data you care about.

## Known gaps (flagged during the initial scaffold, not yet resolved)

- **`user` provisioning**: identity lives in Better Auth (`apps/web`); `apps/api`
  has no sync job. `app/services/users.py::ensure_user` lazily mirrors a JWT's
  claims into the local `user` table on first request instead — fine for FK
  integrity, but means a user who never calls `apps/api` has no local row. If a
  reviewer/admin needs provisioning before their first API call, a real sync
  (webhook from Better Auth, most likely) still needs building.
- **Institution ↔ business scoping**: `require_business_access` lets any
  reviewer/admin token access any business — the `institution_id` → business
  relationship isn't modeled yet (it isn't in `specs/00-domain-model.md` either).
  Needs a decision before real reviewer accounts exist.
- **Document upload** returns a placeholder `upload_url`; there's no
  `app/services/storage/` yet, so nothing actually lands in an object store.
- ~~`apps/web` side of auth isn't built yet~~ — **resolved**: Better Auth is now
  mounted in `apps/web` (`apps/web/lib/auth.ts`), matches this app's expected
  claim shape, and a full signup → JWT → `apps/api` round trip has been run
  end-to-end against a real Postgres (not just unit-tested against a mocked
  JWKS). `business_id`/`institution_id` still come through `null` on every
  token, though — see `apps/web/README.md`'s "Known gap" on that write-back.
