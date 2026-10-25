# API documentation

Interactive docs are served at [http://localhost:4000/api/docs](http://localhost:4000/api/docs). The OpenAPI document is [http://localhost:4000/api/v1/openapi.json](http://localhost:4000/api/v1/openapi.json).

Successful responses use `{ "data": ..., "meta": { "requestId": "..." } }`. List endpoints add `page`, `pageSize`, `total`, and `pageCount`. Errors use `{ "error": { "code", "message", "details", "requestId" } }` and do not include stack traces.

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Sets HttpOnly access and refresh cookies and a readable CSRF cookie. Rate limited. |
| POST | `/api/v1/auth/refresh` | Rotates the refresh session. Reuse of a revoked token revokes the user's sessions. |
| POST | `/api/v1/auth/logout` | Revokes the refresh session and clears cookies. |
| GET | `/api/v1/auth/me` | Current user and permissions. |
| GET | `/api/v1/auth/csrf` | Returns the CSRF token. |

State-changing requests send `X-CSRF-Token` equal to the `payguard_csrf` cookie. Login and signed sandbox webhooks are the exceptions.

## Payments

`POST /api/v1/payments` requires `Idempotency-Key` and `payments:write` (admin). Amounts are positive integers in minor units.

Scenarios:

- `success` — `201`, status `SUCCEEDED`
- `decline` — `201`, status `FAILED` (the resource was created; the issuer declined it)
- `gateway_failure` — `503`, payment stays `PENDING`, idempotency row is `FAILED` and can be retried
- `timeout` — `202`, status `REQUIRES_RECONCILIATION`
- `delayed_webhook` — `202`, status `PROCESSING` until the webhook is applied

`POST /api/v1/payments/:id/simulate` is admin-only. It can move a non-terminal payment to success, decline, or unknown. Repeating the current outcome is a no-op. A terminal payment cannot move backward (`409 INVALID_PAYMENT_TRANSITION`).

## Webhooks

`POST /api/v1/webhooks/sandbox/events` requires `X-Sandbox-Signature`, the hex HMAC-SHA256 of the raw body using `WEBHOOK_SANDBOX_SECRET`. The event is committed before `202` is returned. A duplicate `id` returns `duplicate: true` and does not insert a second row.

`POST /api/v1/webhooks/:id/replay` requeues `FAILED` and `DEAD_LETTER` events. `PROCESSED` events are rejected.

## Reconciliation and audit

`POST /api/v1/reconciliation/runs` compares payments with provider statements and stores mismatches. `POST /api/v1/reconciliation/items/:id/resolve` records resolve or ignore with a note. It does not change payment status. Repeating it after the item leaves `OPEN` is safe.

`GET /api/v1/audit-logs` is admin-only.

## Health

`GET /health/live` and `GET /health/ready` are unauthenticated. Ready checks PostgreSQL and Redis. `GET /api/v1/health` adds worker heartbeat and queue depth for signed-in operators and does not return secrets.
