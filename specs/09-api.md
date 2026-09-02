# 09 — HTTP API

Module: `app/api/`

FastAPI. One router module per resource in `app/api/routers/`. All request and
response bodies are Pydantic v2 models in `app/schemas/`.

---

## 1. Auth

Auth is **Better Auth**, mounted in `apps/web` (Next.js route handlers), Postgres-backed
via its adapter — same database as the rest of the system, not a separate user
store. `apps/api` issues no credentials of its own. It verifies the session/JWT
Better Auth produces (Better Auth's JWT plugin) on every incoming request.

Owner and reviewer/admin are both Better Auth users, distinguished by a `role`
claim (`Role` enum, §00-domain-model.md §1) synced onto the `user` table's `role`
column. Owners carry `business_id`; reviewer/admin carry `institution_id`.

**Plugins used (configured in `apps/web`):**
- `phoneNumber` — owner login via phone + OTP (SME owners often lack reliable
  email). Replaces a hand-rolled `/v1/auth/otp/*` flow entirely.
- `organization` — models an "institution" (MFI/bank) as an organization, with
  reviewer/admin accounts as members carrying a role. Replaces a hand-rolled
  `institution_id` + role table.
- `jwt` — issues the JWKS `apps/api` verifies against. `apps/api` never touches
  credentials, never issues a token.
- `admin` — role management / ban controls for reviewer/admin accounts.

See `specs/10-web.md` for the frontend-side auth wiring.

**Authorisation in `apps/api`.** `app/api/deps.py`:
- `verify_token()` — validates the Better Auth JWT (signature, expiry, issuer)
  and returns the claims. No local session table.
- `require_role(Role.REVIEWER)` — dependency
- `require_business_access(business_id)` — an owner may access only their own
  business; a reviewer only businesses within their institution.
- Every mutating endpoint writes an `audit_event`.

---

## 2. Endpoints

Money in request and response bodies is **integer pesewas**, with the field name
ending `_pesewas`. Never send a decimal.

### Businesses
```
POST   /v1/businesses
       {legal_name, trading_name?, entity_type, registration_number?, tin?,
        sector_code?, region?, premises_status?}
       → 201 {id, ...}

GET    /v1/businesses/{id}                → BusinessDetail
PATCH  /v1/businesses/{id}                → BusinessDetail
```
`BusinessDetail` marks declared attributes:
```json
{"premises_status": {"value": "rented", "kind": "declared"}}
```

### Documents
```
POST   /v1/businesses/{id}/documents
       {filename, mime, size_bytes, sha256}
       → 201 {document_id, upload_url, upload_expires_at}
       Client PUTs bytes to upload_url, then:

POST   /v1/documents/{document_id}/complete   → 202 {status: "received"}
       Enqueues S1.

GET    /v1/businesses/{id}/documents          → [DocumentSummary]
GET    /v1/documents/{document_id}            → DocumentDetail (includes quality_flags,
                                                 stage_runs, extraction summary)
POST   /v1/documents/{document_id}/confirm    {doc_type} → 200
       Owner confirms a low-confidence classification. Re-enqueues S2 onward.
DELETE /v1/documents/{document_id}            → 204  (soft delete, retains audit)
```

Errors: `DUPLICATE_DOCUMENT` (409), `FILE_TOO_LARGE` (413),
`UNSUPPORTED_MIME` (415), `VIRUS_DETECTED` (422).

### Coverage
```
GET /v1/businesses/{id}/coverage → Coverage   (schema in 00-domain-model.md §4)
```

### Transactions
```
GET   /v1/businesses/{id}/transactions
      ?from&to&category_l1&flag&account_id&page&page_size(≤200)
      → {items: [Transaction], total, page, page_size}

PATCH /v1/transactions/{id}
      {category_l1?, category_l2?, flags?}
      → Transaction
      Reviewer only. Sets category_source='human' (highest precedence).
```

### Indicators / score / checklist / gaps
```
GET /v1/businesses/{id}/indicators?window=12m|6m|3m  → [Indicator]
GET /v1/businesses/{id}/score                        → ReadinessScore
GET /v1/businesses/{id}/checklist?rule_pack=...      → [ChecklistItem]
GET /v1/businesses/{id}/gaps?status=open&severity=   → [Gap]
POST /v1/gaps/{id}/waive  {reason}                   → Gap   (reviewer only)
```

### Recompute
```
POST /v1/businesses/{id}/recompute → 202 {task_id}
     Enqueues S6–S9. Idempotent per input_hash.
GET  /v1/tasks/{task_id}           → {state, progress, result}
```

### Agent
```
POST /v1/businesses/{id}/agent/sessions      → 201 {session_id, score_before}
POST /v1/agent/sessions/{sid}/messages
     {content}
     → text/event-stream

     event: token     data: {"text": "..."}
     event: tool_call data: {"name": "categorise_counterparty", "args": {...}}
     event: tool_result data: {"name": "...", "result": {...}}
     event: done      data: {"questions_asked": n, "gaps_remaining": n}

POST /v1/agent/sessions/{sid}/close → {score_before, score_after, delta}
GET  /v1/agent/sessions/{sid}       → session + messages
```

SSE, not WebSocket — one-directional streaming, survives mobile network changes
better, and needs no separate connection lifecycle.

### Exports
```
POST /v1/businesses/{id}/exports  {format: pdf|json|csv|pack} → 202 {export_id}
GET  /v1/exports/{export_id}                                  → {status, download_url?}
POST /v1/exports/{export_id}/share {expires_days?}            → {share_url, revoke_token}
DELETE /v1/exports/{export_id}/share                          → 204
GET  /v1/exports/{export_id}/access_log                       → [{at, ip_country, user_agent}]
```

### Review queue
```
GET  /v1/review/queue?assignee=&status=      → [ReviewItem]
POST /v1/review/items/{id}/claim             → ReviewItem
POST /v1/review/items/{id}/resolve
     {field_path, corrected_value, note?}    → ReviewItem
```
Resolving writes a new `extraction` row and sets `superseded_by` on the old one.
It never edits in place.

### Webhooks (institution integrations)
```
POST /v1/institutions/{id}/webhooks  {url, events[], secret}
```
Events: `profile.scored`, `profile.export_ready`, `gap.blocker_raised`.
Payloads signed with HMAC-SHA256 in `X-Signature`. Retries: 5 attempts with
exponential backoff.

---

## 3. Errors

```python
class AppError(Exception):
    code: str          # stable, frontend switches on it
    message: str       # human-readable, safe to display
    http_status: int
    detail: dict | None
```

Response body:
```json
{"error": {"code": "DUPLICATE_DOCUMENT",
           "message": "You have already uploaded this file.",
           "detail": {"existing_document_id": "..."}}}
```

Never leak internal exception text, stack traces, SQL, or file paths.

---

## 4. Rate limits

| Scope | Limit |
|---|---|
| OTP request | 3 per phone per 15 min |
| Document upload | 50 per business per hour |
| Agent message | 30 per session per hour |
| Export | 10 per business per day |
| Everything else | 300 per token per minute |

---

## 5. Non-negotiables

- No endpoint returns a credit score, default probability, or lending
  recommendation (INV-5).
- No endpoint accepts a monetary value that will be stored as an indicator input.
  The only writable money in the system comes from document extraction.
- Every response containing a figure carries its `kind`
  (`extracted` / `derived` / `declared`).
- Pagination is mandatory on every list endpoint. Default page size 50, max 200.
