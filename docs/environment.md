# Environment reference

Values below are the names the code reads. Example files contain local placeholders only. Do not commit a filled `.env`.

Generate a production secret locally, once per variable:

```bash
openssl rand -base64 32
```

Use a different value for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `WEBHOOK_SANDBOX_SECRET`. Render can also generate those three when you apply `render.yaml`. Do not reuse the `local-demo` strings. Production startup rejects them.

## Backend

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `development`, `test`, or `production`. |
| `PORT` | no | HTTP port. Defaults to 4000. Render sets this. |
| `HOST` | no | Bind address. Defaults to `0.0.0.0`. |
| `DATABASE_URL` | yes | Prisma runtime connection. On Neon, use the pooled URL with `sslmode=require`. |
| `DIRECT_URL` | for migrations | Direct Neon URL used by `prisma migrate deploy`. Locally it can equal `DATABASE_URL`. |
| `REDIS_URL` | yes | `redis://` locally, `rediss://` for Upstash TLS. |
| `JWT_ACCESS_SECRET` | yes | Access-token signing secret. Minimum 24 characters in production. |
| `JWT_REFRESH_SECRET` | yes | Refresh-token signing secret. Different from the access secret. |
| `ACCESS_TOKEN_TTL_SECONDS` | no | Default 900. |
| `REFRESH_TOKEN_TTL_SECONDS` | no | Default 604800. |
| `CORS_ORIGINS` | yes in production | Comma-separated exact origins. No trailing slash. No `*`. |
| `COOKIE_SECURE` | yes for the public demo | `true` on Render. `false` only for local HTTP. |
| `COOKIE_SAMESITE` | yes for the public demo | `none` when the static site and API are different sites. `lax` locally. `none` requires `COOKIE_SECURE=true`. |
| `WEBHOOK_SANDBOX_SECRET` | yes | HMAC secret for simulated provider events. |
| `LOG_LEVEL` | no | Default `info`. |
| `BCRYPT_ROUNDS` | no | Default 10. |
| `TRUST_PROXY` | yes on Render | `true` so Express honors Render's forwarded headers. |
| `LOGIN_RATE_LIMIT_MAX` | no | Default 10. |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | no | Default 900. |
| `PAYMENT_RATE_LIMIT_MAX` | no | Default 60. |
| `PAYMENT_RATE_LIMIT_WINDOW_SECONDS` | no | Default 60. |
| `WORKER_CONCURRENCY` | no | Webhook jobs processed at once. Render blueprint sets 2. Local default is 4. |

Seed flags are not service configuration. Set them only on the command that seeds:

- `ALLOW_DEMO_SEED=true` allows the seed while `NODE_ENV=production`.
- `SEED_REPLACE=true` allows the seed to delete and replace an existing sandbox dataset.

Password rotation reads `EMAIL` and `NEW_PASSWORD`, or `DISABLE_ACCOUNT=true`. See [deployment.md](deployment.md).

## Frontend

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | yes | API base, including `/api/v1`. Vite bakes it in at build time. |

Local value: `http://localhost:4000/api/v1`.

Render value: `https://YOUR-API-SERVICE.onrender.com/api/v1`.

Changing it requires a new frontend build. It is not a backend secret.
