# Deployment guide

How to run Peti outside a developer machine. The repository contains no hosting configuration: no
Dockerfile, no platform manifest and no infrastructure code. This guide describes what any host must
provide and what the application enforces.

> **Status:** Peti is an MVP. It runs with Razorpay **test-mode** keys only and is not ready to take real
> money or real users. With `APP_ENV=production` it **refuses to start** until a real SMS provider is
> implemented (see below); use `APP_ENV=staging` for a hosted test deployment. Read
> [Not production-ready yet](#not-production-ready-yet) before deploying anything public.

See also: [local setup](local-setup.md), [API overview](../api/api-overview.md),
[payment architecture](../architecture/payment-architecture.md), [SECURITY.md](../../SECURITY.md).

## What you need

| Component        | Requirement                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Application host | Node.js 24 and pnpm 10 (VM or container) able to run `next start` as a long-lived process. It writes structured JSON logs to stdout/stderr |
| Database         | Managed PostgreSQL 18 with the `btree_gist` and `pg_trgm` extensions available                                                             |
| Object storage   | An S3-compatible bucket (private) for listing and condition-report photos                                                                  |
| Email            | An SMTP service (`SMTP_URL`)                                                                                                               |
| Payment provider | A Razorpay account in **test mode**                                                                                                        |
| Scheduler        | Anything that can send `POST /api/cron/sweep` with a bearer token every few minutes                                                        |
| TLS              | HTTPS in front of the app; `APP_URL` must be the public `https://` origin                                                                  |

Sessions, auth rate limits and the application rate limiter are all stored in PostgreSQL, and photos live
in object storage, so several app instances can run behind a load balancer. Each process opens a pool of
up to 10 database connections (`src/shared/infrastructure/prisma.ts`); size the database's connection
limit accordingly.

## Production environment rules

`src/config/env.ts` validates the environment when the application first needs it and refuses to run with
an `Invalid environment configuration` error listing every problem. With `APP_ENV=production`:

| Rule                                                                                             | Why                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `PAYMENT_PROVIDER` must be `razorpay`                                                            | The sandbox provider can never run in production |
| `SANDBOX_PAYMENT_KEY_SECRET` and `SANDBOX_PAYMENT_WEBHOOK_SECRET` must be unset                  | No sandbox secrets anywhere near production      |
| `MAIL_DRIVER` must not be `outbox` (so `smtp`, which requires `SMTP_URL`)                        | Real email delivery                              |
| `STORAGE_DRIVER` must be `s3` (requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) | No local-disk storage                            |
| `CRON_SECRET` is required                                                                        | Protects `POST /api/cron/sweep`                  |
| `RAZORPAY_KEY_ID` must not start with `rzp_live_`                                                | Live payments are not supported by this MVP      |
| `SMS_DRIVER` must not be `outbox` — and `outbox` is the only driver that exists today            | Phone OTPs would never be delivered (see below)  |

These rules apply to `production` only. `APP_ENV=staging` is not held to them, but the sandbox provider is
still refused there (see below) and placeholder secrets are rejected. Configure staging like production
(SMTP, S3) anyway: with the outbox drivers, emails and OTPs are stored in the database but never sent,
and `/dev/outbox` is not available outside `local` and `test`.

Rules that apply in every environment:

- `BETTER_AUTH_SECRET` is at least 32 characters.
- Outside `local` and `test`, any secret still starting with `replace-with` (the `.env.example`
  placeholders) is rejected.
- If `APP_ENV` is unset, it defaults to `production` when `NODE_ENV=production` (fail closed) and to
  `local` otherwise. Always set it explicitly.
- `PAYMENT_PROVIDER=razorpay` requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
  `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_KEY_ID` must start with `rzp_test_`.
- `APP_ENV` (not `NODE_ENV`) decides whether development tooling exists. `/dev/*` pages, the dev outbox
  viewer and the sandbox provider are only available for `local` and `test`. The composition root
  (`src/composition/container.ts`) refuses the sandbox provider for any other `APP_ENV`, including
  `staging`, so a staging deployment also needs Razorpay test keys.

Example production environment (values are placeholders):

```dotenv
APP_ENV=production
APP_URL=https://peti.example.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/peti?sslmode=require
BETTER_AUTH_SECRET=<32+ random characters>

PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<from the Razorpay dashboard, test mode>
RAZORPAY_WEBHOOK_SECRET=<the secret you set on the webhook>

STORAGE_DRIVER=s3
S3_REGION=ap-south-1
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
# S3_ENDPOINT=https://...      # only for non-AWS S3-compatible services
# S3_FORCE_PATH_STYLE=true     # if the service needs path-style URLs

MAIL_DRIVER=smtp
SMTP_URL=smtp://USER:PASSWORD@smtp.example.com:587
MAIL_FROM="Peti <no-reply@example.com>"

CRON_SECRET=<random string>

# Client IP for auth rate limiting: name the header your proxy sets, and list the proxies.
AUTH_IP_HEADERS=x-forwarded-for
AUTH_TRUSTED_PROXIES=10.0.0.10,10.0.0.11
```

### Client IP behind a proxy

Better Auth rate-limits sign-in, sign-up, OTP and password-reset requests per client IP. The IP comes from
the headers named in `AUTH_IP_HEADERS` (default `x-forwarded-for`). A client can send any header it
likes, so:

- name only a header that your load balancer or CDN **sets or overwrites** (for example
  `cf-connecting-ip` behind Cloudflare, or `x-forwarded-for` behind a proxy that appends to it);
- set `AUTH_TRUSTED_PROXIES` to your proxies' addresses so the client address is read from the right
  position in `X-Forwarded-For`;
- never expose the app directly to the internet while trusting a forwarding header — anyone could then
  rotate the header to bypass the auth rate limits.

The application's own per-user limits (bookings, uploads, disputes, reviews) are keyed by user id, not IP.

Keep secrets in the host's secret store, never in the repository. Never set `DATABASE_URL_TEST` or run
the seed against production: `pnpm db:seed` refuses to run when `APP_ENV=production`.

## Deployment steps

From a checkout of the release commit, with the production environment available to every step:

```bash
pnpm install --frozen-lockfile   # postinstall runs `prisma generate`
pnpm db:deploy                   # prisma migrate deploy: applies pending migrations, never resets
pnpm build                       # next build
pnpm start                       # next start (use `pnpm start --port <port>` or the host's port setting)
```

Notes:

- **Migrations first.** Run `pnpm db:deploy` before starting the new version. Never run `pnpm db:migrate`
  (`migrate dev`) or `pnpm db:reset` against production.
- **Extensions.** The migration `20261111190001_integrity_constraints` runs
  `CREATE EXTENSION IF NOT EXISTS btree_gist` and `pg_trgm`. On a managed service, make sure both are
  allowed and that the migration user may create them, or create them beforehand as an administrator.
  The double-booking guarantee depends on `btree_gist` ([ADR-004](../decisions/ADR-004-booking-concurrency.md)).
- **Build-time environment.** Configuration is parsed lazily, so modules can be imported during
  `next build` without a database; CI nevertheless builds with a full environment, and doing the same is
  the safe choice.
- **Health check.** `GET /api/health` returns `200 {"status":"ok"}`. It does not query the database, so
  use it for liveness, not as proof that the database is reachable.
- **Request size.** Photos are uploaded through Server Actions with a 9 MB body limit
  (`next.config.ts`); any reverse proxy in front of the app must accept request bodies of at least that
  size. Browsers downscale photos to at most 2400 px before uploading, so a condition report with several
  phone photos normally stays well under the limit.

## Scheduler: the sweep

Deadlines (approval and payment expiry, auto-completion after the inspection window, automatic
`NOT_RETURNED` disputes), refund dispatch, notification emails and review publication all run in the sweep.
Nothing else triggers them. Call it every few minutes (for example every 5 minutes):

```bash
curl -fsS -X POST "https://peti.example.com/api/cron/sweep" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- Without the correct bearer token the endpoint answers `401`.
- A successful run returns a JSON report and logs `sweep completed` with the same report. A booking step
  that throws is logged as `sweep step failed` (booking id, step, message) and listed under
  `bookings.failures`; the rest of the sweep carries on. Alert on these.
- The sweep is idempotent and safe to run concurrently with user actions or with another sweep: each
  booking is handled in its own short transaction with a status re-check; refunds and notification emails
  are claimed with `SKIP LOCKED`. A refund whose worker crashed after claiming it is reclaimed after 15
  minutes (the provider call is idempotent on Peti's refund id).
- Refunds the provider rejects five times are marked `FAILED` and listed under **Refunds that failed** on
  `/admin/payouts`, where an administrator can queue them again (audit-logged).
- If the scheduler stops, bookings stop expiring, refunds stay pending and booking emails are not sent.
  Monitor it.

## Razorpay test mode

The Razorpay adapter (`src/modules/payments/infrastructure/razorpay-provider.ts`) implements Orders →
Checkout.js → signed callback → signed webhook. It has not been exercised against Razorpay in CI; the
sandbox provider covers the same code paths in tests.

1. In the Razorpay dashboard, switch to **Test mode** and generate API keys. Set `RAZORPAY_KEY_ID`
   (`rzp_test_…`) and `RAZORPAY_KEY_SECRET`.
2. Add a webhook:
   - **URL:** `https://<your APP_URL host>/api/payments/webhook/razorpay` (must be publicly reachable over
     HTTPS);
   - **Secret:** a random string; set the same value as `RAZORPAY_WEBHOOK_SECRET`;
   - **Events:** `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
     The adapter also understands `payment.authorized` but does not need it.
3. No callback URL needs configuring in the dashboard: the app passes
   `APP_URL/api/payments/callback/razorpay` to Checkout with each order.
4. **Turn on automatic capture** (Account & Settings → Payment capture → Automatic). Peti never calls
   the capture API: it confirms a booking only on a `CAPTURED` payment. With manual capture, payments stay
   `authorized`, bookings stay awaiting payment until they expire, and Razorpay auto-refunds the
   authorisation later.
5. Pay with Razorpay's test instruments and confirm that the booking becomes confirmed and that the
   webhook deliveries in the dashboard show `200`.

The webhook route verifies `x-razorpay-signature` (HMAC-SHA256 of the raw body) before storing anything,
deduplicates by `x-razorpay-event-id`, and answers `500` when processing fails so that Razorpay retries.
A booking is confirmed only after a provider-confirmed capture: a webhook counts once its signature is
verified, and a browser callback's payment is re-fetched from Razorpay before it counts, because a
callback signature proves authorisation, not capture.

Money that does not fit a booking — a second capture on an already-paid order, or a captured amount that
differs from the booking total — is never applied. The webhook answers `200 flagged` (so Razorpay stops
retrying), the event is stored as `IGNORED`, and an audit entry `payment.unexpectedCapture` is written.
Search the activity log for it and refund such payments by hand in the Razorpay dashboard.

## Security headers

`next.config.ts` sets these headers on every response and disables `X-Powered-By`:

| Header                   | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| `X-Content-Type-Options` | `nosniff`                                                  |
| `X-Frame-Options`        | `DENY`                                                     |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`                          |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=(), payment=(self)` |

With `APP_ENV` set to `staging` or `production`, `Strict-Transport-Security: max-age=31536000;
includeSubDomains` is added (only serve those environments over HTTPS). `/api/files/*` additionally sends
`Content-Security-Policy: default-src 'none'`. There is no site-wide Content-Security-Policy yet. Auth
cookies are marked `Secure` automatically when `APP_URL` starts with `https://`.

## Backups

The database is the system of record: bookings and their status history, payments, refunds, deposits,
payouts, disputes and the append-only audit log. Photos are in the bucket and referenced by key from the
database.

- Enable automated backups with point-in-time recovery on the managed PostgreSQL service, and test a
  restore into a separate instance regularly.
- Enable versioning (or an equivalent retention policy) on the bucket, and keep it private: the app serves
  photos through `/api/files` and enforces access to condition-report photos itself.
- Back up the secrets (`BETTER_AUTH_SECRET`, Razorpay keys, webhook secret, `CRON_SECRET`) in the secret
  store. Better Auth signs its cookies and tokens with `BETTER_AUTH_SECRET`, so rotating it signs
  everyone out.
- After a restore, run the sweep and check payments against the Razorpay dashboard: webhooks that arrived
  after the restore point are not in the database.

## Public demo on Vercel

The hosted demo is **not** a production deployment. It runs with `APP_ENV=test` so visitors can try the
whole flow with the sandbox payment provider and read emails and one-time codes at `/dev/outbox`.

| Piece       | Demo setting                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Database    | Free Neon Postgres (Singapore) from the Vercel Marketplace; functions run in `sin1` (`vercel.json`)               |
| Photographs | Seeded into `demo-storage/` locally, uploaded with the deployment and traced into `/api/files` (`next.config.ts`) |
| Scheduler   | Vercel Cron calls `GET /api/cron/sweep` once a day with `Authorization: Bearer $CRON_SECRET` (Hobby limit)        |
| Client IP   | `AUTH_IP_HEADERS=x-real-ip` (set by Vercel's edge)                                                                |
| Uploads     | Not persisted: the serverless disk is read-only, and request bodies are capped at 4.5 MB                          |

Caveats, all accepted for a demo with fictional data only:

- `/dev/outbox` is public, so anyone can read any sign-in code or password-reset link and take over any
  account. That is why the demo is seeded with `--without-admin`: there is no administrator account.
- Test-mode auth rate limits are looser than production's.
- Deadlines run once a day, not every few minutes.

Setting it up (from the repository root, with the Vercel CLI logged in):

```bash
npx vercel link --yes --project peti
npx vercel integration add neon --billing-plan free_v3 --meta region=sin1 --meta auth=false \
  -e production -e preview --no-env-pull   # accept the Neon terms in the browser when asked
npx vercel env pull --environment production .env.vercel
# with DATABASE_URL_UNPOOLED from .env.vercel exported as DATABASE_URL:
pnpm db:deploy
APP_ENV=test STORAGE_FS_ROOT=./demo-storage pnpm db:seed -- --without-admin
rm .env.vercel
# project variables (production): APP_ENV=test, APP_URL, BETTER_AUTH_SECRET, PAYMENT_PROVIDER=sandbox,
# SANDBOX_PAYMENT_KEY_SECRET, SANDBOX_PAYMENT_WEBHOOK_SECRET, MAIL_DRIVER=outbox, SMS_DRIVER=outbox,
# STORAGE_DRIVER=filesystem, STORAGE_FS_ROOT=./demo-storage, AUTH_IP_HEADERS=x-real-ip, CRON_SECRET
npx vercel deploy --prod --yes
```

`.vercelignore` keeps `.env` files out of the upload (the Vercel CLI does not read `.gitignore`) but includes
`demo-storage/`.

## Not production-ready yet

The following are missing or deliberately out of scope. Do not take real users or real money until they
are addressed.

| Gap                                          | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Real SMS provider**                        | `SMS_DRIVER` only accepts `outbox`, which stores messages in the database, so `env.ts` refuses `APP_ENV=production`. On staging nothing is sent and `/dev/outbox` does not exist, so phone verification — required to request a booking or submit a listing — cannot be completed there. Implement an `SmsSender` adapter for a provider with DLT registration (sender ID and templates), add it to `SMS_DRIVER`, and the production check passes |
| **Live payments and marketplace settlement** | Only Razorpay test keys are accepted. Owner payouts are recorded and marked paid by an administrator by hand; there is no split settlement (for example Razorpay Route), no KYC of owners and no live-mode review                                                                                                                                                                                                                                 |
| **Legal review**                             | Terms, privacy policy, cancellation and deposit rules are product assumptions, not legal advice ([assumptions and risks](../product/assumptions-and-risks.md))                                                                                                                                                                                                                                                                                    |
| **Tax**                                      | No GST on commission and no TDS handling                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Monitoring and alerting**                  | JSON logs only; no error tracking, uptime checks, metrics or alerts (including for a stalled sweep, `sweep step failed` lines, failed refunds or `payment.unexpectedCapture` audit entries)                                                                                                                                                                                                                                                       |
| **Content-Security-Policy**                  | Only `/api/files/*` has one. A site-wide CSP (with nonces for Next.js scripts and Razorpay Checkout) is still to do                                                                                                                                                                                                                                                                                                                               |
| **Identity verification provider**           | None. The schema has an `identity_verification_status` column that defaults to `UNVERIFIED`, no code sets it, and the UI states that Peti does not check identity documents                                                                                                                                                                                                                                                                       |
| **Hosting**                                  | No hosting provider, container image or infrastructure is configured in this repository                                                                                                                                                                                                                                                                                                                                                           |
