# Roadmap

Tracks build progress against [`product-spec.md`](./product-spec.md) and [`specs/`](./specs).
Check items off as they land. Keep this file in sync with reality-if a checked
item regresses, uncheck it.

---

## Phase 0-Foundation

- [x] Frontend scaffold (`apps/web`, Next.js + Tailwind + TypeScript)
- [x] `Agent.md`-invariants, stack decisions, repo conventions
- [x] `product-spec.md` + `specs/00`–`11` module specs
- [x] `apps/api` scaffold (FastAPI + Celery, one image two entrypoints-§4 of Agent.md)
- [x] Alembic wired up (initial migration covers all 16 tables); pgvector extension + `counterparty.embedding` still deferred to Phase 4
- [x] Postgres 16 + pgvector actually provisioned for a persistent local dev environment (`docker-compose.yml`, `pgvector/pgvector:pg16` image, named volume-extension itself still unused, `counterparty.embedding` stays deferred to Phase 4). Cloud/staging provisioning is a separate, not-yet-done task-this only covers local dev.
- [x] Redis provisioned (`docker-compose.yml`, named volume)
- [x] Object store (MinIO) provisioned (`docker-compose.yml`, named volume + bucket init)-`apps/api/app/services/storage/` now issues real presigned upload URLs against it, replacing the old placeholder
- [x] Docker Compose for local dev (postgres, redis, minio, api, worker, web)
- [x] Better Auth mounted in `apps/web` (email/password + `phoneNumber`, `organization`, `jwt`, `admin` plugins, tables prefixed `auth_` to avoid colliding with `apps/api`'s own `user`/`account` tables)-full signup → JWT → `apps/api` round trip verified end-to-end against a real Postgres

## Phase 1-Frontend (owner + reviewer UI)

- [x] Sign up / log in screen
- [x] Home
- [x] Overview
- [x] Documents
- [x] Counterparties
- [x] Gaps
- [x] Apps (integrations)
- [x] Nearly ready checklist
- [x] Assistant chat (scripted mock)
- [x] Reviewer queue
- [x] Real auth (`/signup` calls Better Auth for real email/password sign up and login)
- [x] Write `business_id` back onto the Better Auth user after a business is created (`app/setup` + `lib/link-business.ts`)-`institution_id` stays open, there's no institution-creation UI yet to trigger it from (see apps/web/README.md "Auth")
- [ ] Wire screens to real API instead of `lib/mock-data.ts`-done for what `apps/api` actually exposes today (business setup, Documents screen via `lib/api-client.ts`); Overview/Counterparties/Gaps/Nearly-ready/Reviewer stay on mock data until their Phase 2 endpoints (coverage/indicators/score/checklist/gaps/review queue) exist
- [x] Real file upload (replace mock document list)-`UploadDropzone` does a real hash → presigned PUT → complete flow against `apps/api`; Documents screen reads the real list back
- [x] Responsive/mobile pass on the existing built screens (owner journey is mobile-first per spec §13.4)-collapsible sidebar/bottom nav, `dvh` viewport units, fluid page containers and grids down to a ~375px viewport. Not a rebuild onto spec's separate owner-route IA (`/upload`, `/profile`, `/chat`, ...), which stays a larger future rearchitecture.
- [x] Loading, empty, and error states for real network calls-done where real calls exist (Documents screen); the rest still runs on mock data so has nothing to load

## Phase 2-Domain model & API surface

_specs: `00-domain-model.md`, `09-api.md`_

- [x] Core tables: `business`, `account`, `document`, `extraction`, `transaction`,
      `counterparty`, `indicator`, `readiness_score`, `gap`, `declaration`,
      `checklist_item`, `audit_event`, plus `agent_session`, `agent_message`,
      `cost_event`, `user`
- [x] `POST /v1/businesses`, `GET /v1/businesses/{id}`, `PATCH /v1/businesses/{id}`
- [x] Document upload endpoints (create/complete/list/get/confirm/delete)-presigned
      `upload_url` is a placeholder until `app/services/storage/` exists
- [x] `audit_event` writes on every mutating call
- [ ] `GET /v1/businesses/{id}/coverage`, transactions, indicators/score/checklist/gaps,
      recompute, agent, exports, review queue, webhooks (rest of `specs/09-api.md` §2)

## Phase 3-Ingestion pipeline (S1–S3)

_specs: `01-ingest-classify.md`, `02-extract.md`_

- [ ] S1 Ingest: virus scan, page split, image straighten, hash, quality flags
- [x] S2 Classify: doc_type + issuer + period (Docling output + explainable heuristics; vision fallback remains open)
- [x] S3 Extract: conservative Docling Markdown table parser for bank/MoMo statements
- [x] S3 Extract: explicit financial-statement line-item parser
- [ ] S3 Extract-Tier 1: issuer-specific MTN MoMo statement parser
- [ ] S3 Extract-Tier 1: top-4 Ghanaian bank PDF parsers
- [ ] S3 Extract-Tier 2: vision extraction (receipts, invoices, handwritten ledgers)
- [ ] S3 Extract-Tier 3: reviewer queue for low-confidence fields
- [x] Dynamic invoice envelope: model-assisted field mapping with optional canonical fields, source references, and provider-specific extras
- [ ] Reconciliation gate (INV-6) enforced before ledger entry

## Phase 4-Normalisation & categorisation (S4–S6)

_specs: `03-normalise-reconcile.md`, `04-categorise.md`_

- [ ] S4 Normalise: pesewa amounts, fee/levy split, counterparty cleanup (basic amount/direction/account persistence exists; full normalisation remains)
- [ ] S5 Dedup: same-document and overlapping-statement detection
- [ ] S5 Internal transfer pairing
- [ ] S5 Period stitching + `missing_period` gap generation
- [ ] S6 Categorise-Tier 1: rule packs
- [ ] S6 Categorise-Tier 2: kNN over counterparty embeddings
- [ ] S6 Categorise-Tier 3: LLM tiebreak

## Phase 5-Analytics & readiness score (S7–S9)

_specs: `05-analytics.md`, `06-scoring-checklist.md`_

- [ ] All 18 indicators (§8 of product-spec), verified against the `adom_provisions` fixture
- [ ] Four-pillar readiness score with explainable `contributions`
- [ ] Seed rule packs: `gh_mfi_working_capital_v1`, `gh_bank_sme_term_loan_v1`, `gh_asset_finance_v1`
- [ ] Gap generation from checklist evaluation

## Phase 6-Gap-filling agent

_specs: `07-agent.md`_

- [ ] Agent tools: `get_profile_state`, `list_gaps`, `get_gap_context`,
      `record_answer`, `categorise_counterparty`, `request_document`,
      `estimate_score_impact`, `recompute`
- [ ] Question prioritisation by score-impact per owner effort
- [ ] Wire `apps/web` assistant chat to the real agent (replace scripted mock)
- [ ] Red-team eval suite (40+ cases, INV-3 fabrication check)

## Phase 7-Export

_specs: `08-export.md`_

- [ ] Financial Profile PDF (WeasyPrint)
- [ ] Machine-readable JSON export
- [ ] Transaction CSV export
- [ ] Scoped, expiring share links with revocation + access log

## Phase 8-Test harness & acceptance

_specs: `11-testing.md`_

- [ ] `adom_provisions` synthetic fixture business (regression suite for analytics)
- [ ] Golden document corpus (statements, receipts, handwritten pages) with ground truth
- [ ] Adversarial document set (edited PDFs, mismatched balances, injection payloads)
- [ ] Agent replay harness
- [ ] Acceptance thresholds from product-spec §13 met (extraction, analysis, agent, e2e)

## Phase 9-Security, privacy, compliance

- [ ] Data Protection Act 2012 (Act 843)-consent capture, subject-access, erasure
- [ ] Encryption at rest (SSE-KMS) and in transit
- [ ] MSISDN/account number hashing + display-suffix only
- [ ] Fraud defences (§12.4): SHA-256 reuse, EXIF/render-artefact checks, `suspect` flag
- [ ] Document authenticity signals: extract PDF/XMP metadata, producer/creator history,
      timestamps, embedded assets, incremental revisions, and file hashes; compare
      metadata with extracted content and retain the signals as auditable provenance
- [ ] Cryptographic document verification: detect and validate PDF digital signatures
      and trusted electronic seals where present; treat a valid signature as an
      integrity/authenticity signal, not a guarantee that the signer is truthful
- [ ] AI-assisted authenticity review: provide sanitized metadata plus Docling
      structure to OpenAI for bounded `clear`/`review`/`unknown` findings. The model
      must never declare forgery or alter extracted facts; unresolved signals stay
      out of readiness scoring until human review.

  Reference: [NIST Digital Signature Standard](https://www.nist.gov/publications/digital-signature-standard-dss-3)
  and [NIST guidance on authenticating metadata](https://airc.nist.gov/docs/NIST.AI.100-4.SyntheticContent.ipd.pdf).

## Phase 10-Pilot

- [ ] Two-week pilot with ~20 SMEs through one partner MFI
- [ ] Metrics instrumented (§16 of product-spec: time to profile, completion rate,
      score lift, classification coverage, reviewer touch rate, model cost, lender acceptance)
