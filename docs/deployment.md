# Deploy PayGuard for an interview demo

This is a public sandbox. It does not move money. Free plans have quotas, sleep, and can change. Do not add a payment method to Upstash if you want that database to stay on the free tier: Upstash moves free databases to a paid plan when an account gets a payment method.

Nothing in this repository creates a paid Render resource. `render.yaml` sets the API to `plan: free`. Do not delete that field. Render's default for a new web service is a paid instance. Do not add a background worker, cron job, Render Postgres, or Render Key Value service. Render does not offer a free background worker. Free Render Postgres expires about 30 days after creation, so this demo uses Neon instead.

Checked against provider docs on 25 Oct 2026:

| Service | Free allowance observed | What runs out |
| --- | --- | --- |
| Render web service | 0.1 CPU, 512 MB RAM, 750 instance hours per workspace per month | Sleeps after 15 minutes without HTTP traffic. Wakes in about a minute. Hours reset monthly and do not roll over. |
| Render static site | No spin-down | Uses the workspace bandwidth and build-pipeline minutes. Hobby includes 500 pipeline minutes. |
| Neon Postgres | 100 CU-hours per project, 1 GB storage, scale to zero after 5 minutes | Compute suspends until the next period. Data is not deleted. |
| Upstash Redis | 250 MB, 500,000 commands, 10 GB bandwidth, TLS always on, one database | Commands include BullMQ traffic while the API is awake. |

Those numbers come from Render, Neon, and Upstash documentation and can change. This demo is not production payment infrastructure.

## Architecture

```text
Browser
  -> Render static site (React)
  -> Render free web service
       -> API process
       -> webhook worker process
  -> Neon PostgreSQL
  -> Upstash Redis (rediss://)
```

The static site and the API are different sites. Cookies use `SameSite=None`, `Secure`, and the Partitioned attribute so a credentialed browser request can include them. CSRF still compares `X-CSRF-Token` with the `payguard_csrf` cookie. Local development stays on `SameSite=Lax` because the Vite app and API share the `localhost` site.

`backend/src/supervise.ts` is the Render start command. It runs `prisma migrate deploy` once, then starts `dist/index.js` and `dist/worker.js`. If either child exits, the supervisor stops the other and exits so Render can restart the service. Signals are forwarded. The worker is not an unmonitored shell job. Compose keeps the API and worker as separate containers and overrides that command, so local Docker does not start a second worker inside the API container.

Job delivery remains at-least-once. Payment creation is still protected by the PostgreSQL idempotency key. Webhook consumers stay idempotent, and unpublished outbox rows are published again after a crash. The worker does no work while the free web service is asleep. A delayed webhook waits until the next request wakes the service.

## A. Neon

1. Create a Neon account and a project on the Free plan. Leave scale-to-zero enabled.
2. Create the database, or use the default `neondb`.
3. Copy both connection strings from the Neon dashboard.
4. Pooled string, for `DATABASE_URL`, host contains `-pooler`:

```text
postgresql://USER:PASSWORD@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5
```

5. Direct string, for `DIRECT_URL`, host does not contain `-pooler`:

```text
postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require
```

`sslmode=require` is required. `pgbouncer=true` tells Prisma not to use prepared statements that the pooler cannot keep. If the password contains reserved URL characters, percent-encode them. Do not commit either string.

## B. Upstash

1. Create an Upstash account without adding a payment method.
2. Create one Redis database on the free tier. Leave the default region, or pick one near your Render region.
3. Copy the TLS Redis URL. It starts with `rediss://`.
4. Set that value as `REDIS_URL`.

The API enables TLS when the URL uses `rediss://`. A `redis://` URL will not connect to Upstash.

## C. Render API

1. Push this repository to GitHub. In Render, create a Blueprint from the repo, or create a Web Service manually with the same settings.
2. Repository: `Hritik669/PAYGUARD`. Branch: `main`.
3. Runtime: Docker. Instance type: **Free**.
4. Dockerfile path: `backend/Dockerfile`. Docker build context: `backend`.
5. Health check path: `/health/live`. This only proves the process is up. `/health/ready` also checks Postgres and Redis and is the right check to call yourself. It is not the Render health check, because a cold Neon database would otherwise fail the platform check.
6. Add the environment variables from [environment.md](environment.md). For the first deploy, `CORS_ORIGINS` can be a placeholder `https://example.com`. Replace it with the real static-site origin before logging in.
7. Set `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, and `TRUST_PROXY=true`.
8. Do not set `ALLOW_DEMO_SEED` on the service.
9. Deploy and read the logs. A successful boot logs `applying database migrations` and then `PayGuard API listening`. The listener uses `PORT` and `0.0.0.0`.

The image listens on Render's port. Migrations run inside the supervisor before either process accepts work, so two processes do not migrate at the same time. Prisma also locks the migration table. Do not run `prisma migrate reset` against Neon.

## D. Render static site

1. New Static Site. Branch: `main`. Root directory: `frontend`.
2. Build command: `npm ci && npm run build`.
3. Publish directory: `dist`.
4. Environment variable, available at build time:

```text
VITE_API_URL=https://YOUR-API-SERVICE.onrender.com/api/v1
```

5. SPA rewrite: `/*` to `/index.html` with status 200. `frontend/public/_redirects` and `render.yaml` both request that rewrite. Existing built files should still be served. There is no API proxy. The browser calls the API host directly.
6. Redeploy the static site after any change to `VITE_API_URL`. A rebuild is required because Vite inlines it.

## E. Connect the two services

1. Copy the static site origin, for example `https://payguard-web.onrender.com`. No path and no trailing slash.
2. Set the API's `CORS_ORIGINS` to that exact origin and redeploy the API.
3. Open `https://YOUR-API-SERVICE.onrender.com/health/live`. Expect `status: live`.
4. Open `https://YOUR-API-SERVICE.onrender.com/health/ready`. Expect `ready` when Neon and Upstash are reachable. The first call can take several seconds while Neon wakes.
5. Open `https://YOUR-API-SERVICE.onrender.com/api/docs`.

Sign-in uses cookies, not `localStorage`. Use a current Chromium browser. If the browser blocks third-party cookies, the login request can succeed and the next request can still be unauthenticated. The partitioned cookie attribute is there for that case. If a browser still drops the cookies, the demo cannot be authenticated in that browser without putting both apps on one site.

## F. Database initialization

Migrations run on API startup. Seeding does not.

The seed refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`. If any user or payment already exists, it also refuses unless `SEED_REPLACE=true`. `SEED_REPLACE=true` deletes sandbox payments, webhook rows, reconciliation rows, audit rows, sessions, and users, then inserts the demo set again. Do not point it at a database you need to keep.

From a shell on the running Render service, with the service awake:

```bash
ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts
```

Run that once. To rebuild the demo later:

```bash
ALLOW_DEMO_SEED=true SEED_REPLACE=true npx tsx prisma/seed.ts
```

There is no point-in-time undo in this repo. Neon keeps a short restore history on the Free plan (6 hours at the time of writing). That is the only rollback. Taking Neon's one manual snapshot before the first seed is reasonable. Do not expect the app to reverse a bad seed.

Demo accounts after seeding:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@payguard.local | PayGuard-Admin-Demo-1 |
| Analyst | analyst@payguard.local | PayGuard-Analyst-Demo-1 |

These passwords are public because the site is a public demo. They pass the same hashing and role checks as any other account. An analyst cannot create payments, simulate outcomes, replay webhooks, resolve reconciliation, or read the audit log.

Rotate a password from your machine, with `DATABASE_URL` pointing at Neon. The command prints neither the old nor the new password. It revokes refresh sessions.

```bash
cd backend
EMAIL=admin@payguard.local NEW_PASSWORD='a-long-unique-password' npm run db:rotate-password
```

Disable the account. Audit rows stay, with the actor cleared:

```bash
EMAIL=admin@payguard.local DISABLE_ACCOUNT=true npm run db:rotate-password
```

There is no secret admin URL.

## G. Verification

Wait through the first cold start, then:

1. Sign in as the admin. Confirm the overview numbers come from the API, not from hardcoded cards.
2. Open Payments and a payment detail page.
3. Create a simulated payment twice with the same `Idempotency-Key` and body. The second response is the same payment.
4. Submit the same key with a different amount. Expect a conflict.
5. Run the timeout scenario. The payment becomes `REQUIRES_RECONCILIATION`, not `FAILED`.
6. Open Webhooks. A failed or dead-letter event can be replayed by the admin. A processed event cannot.
7. Run reconciliation and resolve one mismatch. The payment status does not change by itself.
8. Open the audit log as the admin. Sign in as the analyst and confirm that page is denied.
9. Open System health. Postgres, Redis, and the worker should be up while the service is awake. After 15 idle minutes the whole service, including the worker, is asleep until the next HTTP request.

## H. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Docker build cannot find `package-lock.json` | Build context must be `backend`, not the repo root. |
| `prisma migrate deploy` fails on Neon | `DIRECT_URL` must be the non-pooler string and include `sslmode=require`. |
| P1001 or timeout on the first query | Neon is waking from scale-to-zero. Retry. Readiness returns 503 until it answers. |
| Redis error or certificate error | `REDIS_URL` must start with `rediss://`. |
| Browser says the API cannot be reached | Cold start can take about a minute. The client waits up to 70 seconds and then tells you to retry. Also confirm `VITE_API_URL` was set before the frontend build. |
| CORS error | `CORS_ORIGINS` must equal the static site origin exactly. Redeploy the API after changing it. |
| Login appears to work, then the app returns to the login page | Cookie settings. Production needs `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, and `TRUST_PROXY=true`. The page origin must be the CORS origin. |
| CSRF 403 | The app loads the token from `GET /api/v1/auth/csrf` and sends it back. A blocked cookie makes the cookie half of the check fail. |
| Worker stays down | The free service was asleep, or the worker process exited and the supervisor is restarting. Read the Render logs for `child process exited`. |
| `Refusing to seed` | Set `ALLOW_DEMO_SEED=true` only on that command. Set `SEED_REPLACE=true` only when you mean to delete the current sandbox rows. |
| `Refusing to start with local demo secrets` | Generate new secrets. The example values cannot boot production. |
| Free quota | Render suspends free web services after 750 hours or when bandwidth is exhausted and no payment method is present. Upstash stops serving after the monthly command cap. Neon suspends compute after 100 CU-hours. None of these should be fixed by upgrading during this demo. |

## I. Local commands that stay valid

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm install --prefix backend
npm install --prefix frontend
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` still runs the API, the worker, and Vite separately. The public site is the configuration that shares one machine.

## What I cannot do from this repository

Creating the Neon, Upstash, and Render accounts, pasting production secrets, and clicking Deploy need your login. Do not send those secrets back to the coding agent. After the services exist, the checks in section G are the acceptance test.
