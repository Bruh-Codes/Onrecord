# SME Credit Readiness Assistant

Turns the messy records a Ghanaian SME actually has-MoMo statements, bank statements, receipts, invoices, a handwritten sales book-into a structured, provenance-tracked financial profile a lender can assess, plus an explicit list of what's still missing.

Full product/engineering spec: [`product-spec.md`](./product-spec.md). Stage-by-stage design docs: [`specs/`](./specs).

## System design

```mermaid
flowchart LR
  C["Web client<br/>Next.js"]

  subgraph IMG["one image · two entrypoints"]
    API["API<br/>FastAPI · REST + SSE"]
    W["Worker pool<br/>Celery · S1-S10"]
  end

  Q[("Queue<br/>Redis")]
  PG[("Postgres 16<br/>+ pgvector")]
  OS[("Object store<br/>R2 / MinIO")]
  DOC["Document AI<br/>+ PaddleOCR"]
  LLM["LLM API<br/>vision · agent"]

  C -- "https" --> API
  API -- "enqueue" --> Q
  Q -- "claim" --> W
  API -- "reads" --> PG
  W -- "read state / write result" --> PG
  W -- "originals + renders" --> OS
  W -- "OCR" --> DOC
  W -- "classify · agent" --> LLM
```

The API and worker pool ship from a single image with two entrypoints: the API serves the web client over REST + SSE and reads Postgres directly; the worker pool claims jobs off Redis and runs the S1–S10 pipeline (ingest → classify → extract → normalise → reconcile → categorise → analyse → score → checklist → export), writing results back to Postgres, storing originals/renders in the object store, and calling out to Document AI / PaddleOCR for OCR and the LLM API for vision extraction and the gap-filling agent.

### Current document-processing path

The production worker uses Docling for PDF/image OCR, layout, table extraction,
and Markdown export. The active path is:

`upload → presigned object storage → Celery worker → Docling → classification → extraction → recompute`

Bank and MoMo statement tables are parsed into auditable `extraction` and
`transaction` rows with provenance. Financial statements are parsed into
explicit line-item `extraction` rows (revenue, profit, assets, liabilities,
equity, and similar fields). The parser never invents totals or transactions
when a value is not printed. Unsupported or ambiguous files remain flagged for
review.

In Railway production, the API and worker must share the same S3-compatible
bucket settings (`STORAGE_ENDPOINT_URL`, `STORAGE_ACCESS_KEY`,
`STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION`). The worker runs with
Celery concurrency `1` because Docling's local models are CPU/memory intensive.

## Repo layout

```
apps/web/       Next.js frontend (App Router, Tailwind 4, TypeScript)
specs/          Per-stage engineering specs (S1-S10, domain model, API, testing)
product-spec.md Full MVP engineering specification
Agent.md        Rules for AI-assisted changes in this repo
```

## Requirements

| Tool                             | Used for                                | Version    |
| -------------------------------- | --------------------------------------- | ---------- |
| [Bun](https://bun.sh)            | `apps/web` package manager + dev server | 1.3+       |
| [uv](https://docs.astral.sh/uv/) | `apps/api` Python env + package manager | latest     |
| Python                           | `apps/api`                              | 3.12       |
| Postgres                         | shared by both apps (see below)         | 16         |
| Redis                            | `apps/api` worker (Celery) only         | any recent |

Both apps read from the **same Postgres database**-Better Auth's tables
(`apps/web`, prefixed `auth_`) and the domain model (`apps/api`, `user`,
`business`, `document`, ...) coexist without colliding. One local Postgres
instance is enough for both.

## Running locally

### Docker Compose (recommended)

Brings up Postgres 16 (pgvector-enabled image), Redis, MinIO (S3-compatible
object store), the API, and the Celery worker together, each with a persistent
named volume-no throwaway cluster, no manual `.env` wiring. The web app runs
separately (`bun dev` in `apps/web`, or from Vercel in production):

```bash
cp .env.example .env   # defaults work as-is; override BETTER_AUTH_SECRET etc. if you want
docker compose up
```

| Service       | URL                                                                   |
| ------------- | --------------------------------------------------------------------- |
| API           | http://localhost:8000 (`/healthz`, `/docs`)                           |
| MinIO console | http://localhost:9001 (login: `minioadmin` / `minioadmin` by default) |
| Postgres      | `localhost:5432` (`sme`/`sme`)                                        |
| Redis         | `localhost:6379`                                                      |

The `api` service runs `alembic upgrade head` on boot and is bind-mounted for
live reload-edit code on the host, see it reflected in the container.
`minio-init` creates the `sme-documents` bucket on first run and exits-that's
expected, not a failure.

### Running the two apps directly (no Docker)

Start Postgres and Redis first (a throwaway local Postgres cluster works fine —
see `apps/api/README.md` "Run migrations" for a quick `initdb`/`pg_ctl` recipe if
you don't have one running).

**1. `apps/api`-backend**

```bash
cd apps/api
uv venv --python 3.12
uv pip install -e ".[dev]"
# create .env-see apps/api/README.md "Setup" for the required vars
.venv/Scripts/alembic upgrade head        # Windows; .venv/bin/... on macOS/Linux
.venv/Scripts/uvicorn app.api.main:app --reload
```

API on `http://localhost:8000` (`/docs` for OpenAPI, `/healthz` for liveness).
Run the worker separately when you need it:

```bash
.venv/Scripts/celery -A app.workers.celery_app worker --loglevel INFO
```

**2. `apps/web`-frontend**

```bash
cd apps/web
bun install
# create .env.local-see apps/web/README.md "Auth" for the required vars
bunx auth migrate -y                      # applies Better Auth's tables
bun dev
```

Web app on `http://localhost:3000`.

Full detail (env vars, auth internals, known gaps, build/lint/test commands) is
in each app's own README: [`apps/api/README.md`](./apps/api/README.md),
[`apps/web/README.md`](./apps/web/README.md).

## Contributing

`main` is protected-direct pushes are rejected. All changes go through a pull request:

```bash
git checkout -b my-feature
# commit your changes
git push -u origin my-feature
gh pr create        # or use the URL git prints after the push
```

Pushing the branch alone does **not** open a PR-`gh pr create` (or the GitHub UI) is a separate, one-time step. Once a PR exists, further pushes to the same branch update it automatically; you don't need to run `gh pr create` again.

See [`Agent.md`](./Agent.md) for the rules this repo's code-human or AI-written-follows (file size limits, component structure, readability).
