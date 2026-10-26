# PayGuard project audit

Audit date: 26 October 2026. This document describes the repository as inspected before the registration, screenshot, and README pass. It is a baseline, not a claim that every later change is already present.

PayGuard is a sandbox payment-operations platform. It records simulated charges, keeps one payment under duplicate requests, and shows webhook and reconciliation failures to an operator. It does not move money and it does not accept card numbers, CVVs, or bank credentials.

## 1. Current architecture

PayGuard is a modular monolith with two Node processes:

- The Express API in `backend/src/index.ts` serves `/api/v1` and `/health`.
- The worker in `backend/src/worker.ts` publishes the webhook outbox, processes BullMQ jobs, delivers merchant webhooks, recovers stuck work, and writes a heartbeat.

Both processes share PostgreSQL (Prisma) and Redis (dashboard cache, rate limits, access-token denylist, BullMQ). The React console in `frontend/` talks to the API with HttpOnly cookies. It does not open a database connection.

```text
Browser → Express API → PostgreSQL
                     → Redis (cache, rate limit, denylist, BullMQ)
Worker → PostgreSQL + Redis → simulated webhook HTTP
```

Request path: route, authentication, permission check, Zod validation, controller, service, repository. Controllers map HTTP. Services own transactions, the payment state machine, idempotency, and audit writes.

Major backend modules under `backend/src/modules`:

| Module | Responsibility |
| --- | --- |
| identity | Login, refresh rotation, logout, CSRF cookies, roles |
| payments | Simulated charges, voids, refunds, status transitions |
| transactions | Ledger rows derived from payments |
| idempotency | Scoped keys, request fingerprints, replay |
| webhooks | Provider inbox, HMAC, outbox, retries, replay |
| merchant-webhooks | Outbound merchant endpoints, signed delivery, local sink |
| exceptions | Unknown outcomes and operator decisions |
| reconciliation | Statement match and mismatch persistence |
| audit | Append-only action log |
| dashboard | Cached operational summary |
| health | Liveness, readiness, dependency status |
| jobs | Worker loop |

PostgreSQL is the source of truth. Redis is optional for correctness of payment state and required for rate limits (those routes fail closed).

## 2. Existing working functionality

These behaviors are implemented in code and covered by unit or integration tests. This audit did not re-run the suite; the later verification pass records actual results.

### Authentication and authorization

- Email and password login. Passwords are bcrypt hashes. Login failures use one message for unknown email and bad password, and a dummy hash keeps the comparison path similar.
- Short-lived JWT access cookie (`payguard_access`, HttpOnly, path `/api`) and rotating refresh cookie (`payguard_refresh`, HttpOnly, path `/api/v1/auth`).
- Refresh reuse revokes the user's outstanding refresh sessions.
- Logout revokes the refresh row and best-effort denylists the access token `jti` in Redis.
- CSRF double-submit cookie for unsafe methods, with explicit exemptions for login, the provider webhook inbox, and the local merchant sink.
- Roles: `ADMIN` and `ANALYST`. Analysts can read operations. They cannot create payments, simulate outcomes, refund, void, replay webhooks, run reconciliation, resolve mismatches, or read the audit log.
- Login and payment-creation rate limits. Redis outages return `503 RATE_LIMIT_UNAVAILABLE`.
- Zod validation and a shared error envelope `{ error: { code, message, details, requestId } }`.

### Payments, ledger, and idempotency

- Create, list, filter, sort, and read payments. Filters include status, currency, text, and created-at range. Pagination is `page` / `pageSize`.
- Scenarios: `success`, `decline`, `gateway_failure`, `timeout`, `delayed_webhook`.
- State machine: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `REQUIRES_RECONCILIATION`, `VOIDED`, `PARTIALLY_REFUNDED`, `REFUNDED`. Invalid transitions return `409`.
- Ledger rows for authorization, capture, void, refund, and adjustment, each with a unique reference.
- Idempotency records are unique on `(scope, userId, key)`, store a request hash, processing state, and response, and expire after 24 hours. Identical retries replay. A different payload returns `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. Concurrent creates are serialized by the unique constraint. Payment rows also have a unique merchant reference and a unique idempotency key column.
- Refunds and voids are admin-only and idempotent. A refund cannot exceed the captured amount.

### Webhooks, jobs, reconciliation, audit, cache

- Provider events are stored before acknowledgement. `providerEventId` is unique. Payloads are HMAC-SHA256 with `WEBHOOK_SANDBOX_SECRET`.
- An outbox row is written in the same transaction as the event. The worker publishes to BullMQ and retries with bounded exponential backoff, then dead-letters. Replay is admin-only and rejects already processed events.
- Merchant endpoints store a signing secret that is returned only on create. Delivery is asynchronous, signed, timeout-bounded, and retried. URLs must be https, or http on localhost. Private and link-local addresses are rejected. Redirects are not followed. A local sink records receipts for development.
- Reconciliation compares internal payments with `provider_statements`, persists runs and mismatch items (amount, missing internal, missing provider, status, duplicate), and supports resolve or ignore without mutating payment state.
- Audit rows store actor, action, resource, timestamp, request id, and metadata. Password hashes, tokens, and webhook secrets are not written there.
- Dashboard summaries are cached in Redis for 30 seconds and invalidated by a version counter after payment writes. Payment status reads come from PostgreSQL.
- OpenAPI is served at `/api/docs` and `/api/v1/openapi.json`.
- Docker Compose defines PostgreSQL 16, Redis 7, API, worker, and frontend. Root npm scripts run the three local processes with `concurrently`.
- Seed data creates an admin, an analyst, payments, statements, and webhook history. Demo passwords are refused when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`. Replacing seed data requires `SEED_REPLACE=true`.

### Frontend

The Vite React console has login, overview charts, payments, payment detail (including simulate, void, and refund), transactions, provider webhooks, exceptions, merchant events, reconciliation, an admin audit log, and health. It uses TanStack Query, Axios with cookie credentials, React Router, Tailwind, Recharts, and Sonner toasts. Protected routes and permission gates exist. Loading, empty, and error states are present on the main lists.

## 3. Incomplete or missing features

Relative to a polished interview demo, these gaps were present at audit time:

1. **No self-service registration.** Accounts exist only through the seed. The product requirement asks for registration of a regular user. Admins should stay seeded; a public register endpoint must not accept a role.
2. **No screenshot files.** The README tells a reader to capture screens and does not embed images under `docs/screenshots/`.
3. **README is shorter than an interview walkthrough.** Architecture, schema, and API notes live in `docs/`, but the root README does not yet carry the full setup, workflow, environment, testing, and discussion sections in one place.
4. **OpenAPI is a map, not a full contract.** Paths exist for the main operations, but several merchant-webhook and exception routes are thinner than the implementation (delivery list, replay, sink, exception decision). Examples are uneven.
5. **Architecture note is slightly behind the worker.** `docs/architecture.md` describes outbox publishing and does not mention merchant delivery dispatch, which the worker loop already performs.
6. **No third "USER" role.** `ANALYST` is the regular operator. That is a naming choice, not a missing permission model.
7. **Frontend date filters.** The API accepts `from` and `to` on payments. The payments page filters by status, currency, and search. The overview page has a day-range control. A dedicated created-at control on the payments table was not required to make the API correct.

Not missing, and not to be rebuilt: idempotency, the state machine, provider webhooks, merchant webhooks, reconciliation, audit logs, Redis caching, BullMQ, CSRF cookies, and the operations console.

## 4. Bugs and security issues

No critical authorization bypass showed up in the route table. Notes from review:

| Item | Severity | Notes |
| --- | --- | --- |
| Public registration absent | Product gap | Addressed after this audit. Must create `ANALYST` only. |
| Webhook signing secrets stored recoverable | Accepted | HMAC delivery needs the secret. It is omitted from list responses and audit metadata. Do not log it. |
| Access-token denylist depends on Redis | Documented | Refresh revocation in PostgreSQL is the logout boundary. Access tokens are short-lived. |
| Rate limits fail closed | Intentional | Login and payment creation return 503 if Redis cannot count. |
| CORS allows a missing `Origin` | Intentional | Browser calls still check `CORS_ORIGINS`. Non-browser clients such as curl have no Origin. |
| SSRF | Mitigated | Merchant URLs are parsed, credentials are rejected, http is localhost-only, private IPv4 and metadata hosts are rejected, redirects are manual. DNS rebinding is not fully solved; the local policy is a development control, not a formal SSRF product. |
| Demo passwords in the README | Development only | Seed refuses them in production unless `ALLOW_DEMO_SEED=true`. They are sandbox credentials, not secrets for a real processor. |
| `payment.idempotency_key` is globally unique | By design | The idempotency table is also scoped by user. A key cannot be reused for a second payment row. |
| Error responses | Sound | Shared handler. Login does not reveal which field was wrong. Validation details are field messages, not stack traces. |
| SQL | Sound | Prisma parameterized queries. No string-built SQL in the modules reviewed. |

Cookies: `httpOnly` on access and refresh, `Secure` and `SameSite` from environment, CSRF cookie readable by the SPA on purpose. `SameSite=None` is rejected unless `Secure` is true. Production startup refuses the example JWT secrets.

## 5. Database and API improvements

The schema already has the constraints the payment flow needs:

- Unique email, refresh token hash, merchant reference, provider reference, payment idempotency key, transaction reference, provider event id, idempotency `(scope, userId, key)`, webhook delivery attempt, merchant delivery attempt, provider statement reference.
- Foreign keys with cascade or set-null that match the aggregates.
- Indexes on payment status and created time, transaction status, webhook status and next attempt, audit actor and resource, reconciliation run and item status, merchant delivery status and next attempt.

Worth keeping, not rewriting:

- Money stays in minor units (`amountMinor`) plus an ISO currency. Amounts are not summed across currencies.
- Status changes, ledger rows, and audit rows that belong together use a transaction.
- Idempotency and payment uniqueness are database constraints, not Redis locks.

API consistency is already good: Zod at the edge, `{ data, meta }` success envelope, `{ error }` failure envelope, request ids, and cursor-free offset pagination.

Smaller follow-ups, in order:

1. Registration endpoint and console page, with tests.
2. OpenAPI entries for registration and the thinner merchant and exception routes.
3. Refresh the architecture note so the worker description matches `worker-loop.ts`.
4. Screenshots of the running console and a README that an interviewer can follow without the other docs.
5. Leave the existing migrations in place. Do not reset the development database.

## 6. Proposed implementation order

1. Record this audit.
2. Add analyst self-registration (API, CSRF exemption, rate limit, audit event, React page, OpenAPI, tests). Do not allow role selection.
3. Run unit tests, integration tests, and type checks. Fix regressions from that change only.
4. Start PostgreSQL, Redis, API, worker, and frontend locally. Exercise login, dashboard, payments, webhooks, reconciliation, and audit.
5. Capture real screenshots into `docs/screenshots/`.
6. Rewrite the root README from the running system and align the short architecture note.
7. Do not deploy, do not push, and do not commit `.env` files.

## Follow-up completed in this pass

- `POST /api/v1/auth/register` creates an `ANALYST` only, rate-limits the route, skips CSRF like login, hashes the password, writes `auth.register`, and starts a session. The console has `/register`.
- OpenAPI now includes registration, merchant delivery history, replay, the local sink, and exception decisions.
- Screenshots of the running console are in `docs/screenshots/`.
- The root README was rewritten from the running system.
- No new migration was required. Existing migrations were already applied to the local development database.
