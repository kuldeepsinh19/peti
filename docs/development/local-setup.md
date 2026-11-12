# Local setup

How to run Peti on your own machine with demo data, a local PostgreSQL, a fake payment provider and an
in-app outbox for email and SMS. Nothing here sends real messages or moves real money.

See also: [testing guide](testing-guide.md), [deployment guide](deployment-guide.md),
[API overview](../api/api-overview.md), [CLAUDE.md](../../CLAUDE.md).

## Prerequisites

| Tool    | Version    | Notes                                                                      |
| ------- | ---------- | -------------------------------------------------------------------------- |
| Node.js | 24 (LTS)   | `package.json` requires `>=24.0.0`                                         |
| pnpm    | 10         | Pinned through `packageManager`; `corepack enable` picks the right version |
| Docker  | Compose v2 | Runs PostgreSQL 18 (and optionally RustFS for S3)                          |
| Git     | any recent |                                                                            |

Use pnpm, not npm or Yarn: the lockfile is `pnpm-lock.yaml`, and `pnpm.onlyBuiltDependencies` allows the
install scripts that Prisma and sharp need.

## Clean setup

### 1. Clone and install

```bash
git clone https://github.com/kuldeepsinh19/peti.git
cd peti
pnpm install
```

`pnpm install` runs `prisma generate` (the `postinstall` script), which writes the Prisma client to
`src/generated/prisma` (git-ignored). It does not need a database.

### 2. Create `.env`

```bash
cp .env.example .env
```

Every variable is validated at start-up by `src/config/env.ts`; the app refuses to start with a clear list
of problems if something is missing. Replace the placeholder secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

| Variable                         | Local value                                       | Notes                                                                 |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `APP_ENV`                        | `local`                                           | Enables `/dev/*`, the sandbox payment provider and the outbox         |
| `APP_URL`                        | `http://localhost:3000`                           | Must match where `pnpm dev` is listening (see troubleshooting)        |
| `DATABASE_URL`                   | `postgresql://peti:peti@localhost:5432/peti`      | Docker Compose database                                               |
| `DATABASE_URL_TEST`              | `postgresql://peti:peti@localhost:5432/peti_test` | Integration tests only                                                |
| `BETTER_AUTH_SECRET`             | generated, at least 32 characters                 | Required                                                              |
| `PAYMENT_PROVIDER`               | `sandbox`                                         |                                                                       |
| `SANDBOX_PAYMENT_KEY_SECRET`     | generated                                         | Required for the sandbox; no default in code                          |
| `SANDBOX_PAYMENT_WEBHOOK_SECRET` | generated (different from the key secret)         | Required for the sandbox; no default in code                          |
| `STORAGE_DRIVER`                 | `filesystem`                                      | Photos are written under `STORAGE_FS_ROOT` (`./storage`, git-ignored) |
| `MAIL_DRIVER`, `SMS_DRIVER`      | `outbox`                                          | Messages are stored in the database and shown at `/dev/outbox`        |
| `CRON_SECRET`                    | generated                                         | Needed by `pnpm jobs:sweep`                                           |

`AUTH_TRUSTED_ORIGINS` (comma-separated) is only needed if you open the app from an origin other than
`APP_URL`.

### 3. Start PostgreSQL

```bash
docker compose up -d
```

This starts `postgres:18` on port 5432 (override with `POSTGRES_PORT`) with user, password and database
`peti`. On first start, `docker/postgres/init/01-create-test-database.sql` also creates the `peti_test`
database used by the integration tests. Data lives in the `pgdata` volume.

### 4. Apply migrations

```bash
pnpm db:migrate
```

This runs `prisma migrate dev` against `DATABASE_URL`. The migrations also create the `btree_gist` and
`pg_trgm` extensions, the exclusion constraint, checks, triggers and reference data. If you only want to
apply the existing migrations without Prisma's interactive development checks, `pnpm db:deploy`
(`prisma migrate deploy`) does that.

Prisma 7's `migrate dev` no longer runs `generate` or the seed. If you change `prisma/schema.prisma`, run
`pnpm db:generate` yourself.

### 5. Seed demo data

```bash
pnpm db:seed
```

`prisma/seed.ts` loads Ahmedabad localities, categories, six fictional demo accounts and eleven demo
listings with photos (written through the configured storage driver). It is idempotent — re-running
updates reference data and skips accounts and listings that already exist — and it refuses to run when
`APP_ENV=production`. It does not create bookings.

### 6. Run the app

```bash
pnpm dev
```

Open <http://localhost:3000>.

## Demo accounts

From `prisma/seed-data.ts`. All accounts are fictional, have verified email and phone, and share the
password **`peti-demo-password`**.

| Email              | Name          | Role  | Seeded listings                                       |
| ------------------ | ------------- | ----- | ----------------------------------------------------- |
| `admin@peti.local` | Peti Admin    | admin | —                                                     |
| `aarav@peti.local` | Aarav Desai   | user  | 2                                                     |
| `meera@peti.local` | Meera Shah    | user  | 3                                                     |
| `kabir@peti.local` | Kabir Patel   | user  | 3 (one is `PENDING_REVIEW`, for the moderation queue) |
| `isha@peti.local`  | Isha Mehta    | user  | 3                                                     |
| `rohan@peti.local` | Rohan Trivedi | user  | — (a renter account)                                  |

Phone numbers are `+919000000001` to `+919000000006` in the same order. Owners' pickup addresses are
labelled "Demo address — not a real location".

## Email, SMS and one-time codes: `/dev/outbox`

With `MAIL_DRIVER=outbox` and `SMS_DRIVER=outbox`, nothing is sent. Messages are stored in the
`dev_outbox_messages` table and the latest 50 are shown at <http://localhost:3000/dev/outbox>:

- email confirmation and password-reset links, written as soon as Better Auth sends them;
- phone verification codes (6 digits, valid 5 minutes);
- booking notification emails, which are queued and only delivered to the outbox when the sweep runs
  (see below). In-app notifications appear at `/account/notifications` immediately.

`/dev/*` pages exist only when `APP_ENV` is `local` or `test`; otherwise they return 404.

To use a real SMTP server locally instead, set `MAIL_DRIVER=smtp` and `SMTP_URL`. SMS has no real driver.

## Payments: `/dev/sandbox-checkout`

With `PAYMENT_PROVIDER=sandbox`, paying for an approved booking sends the renter to
`/dev/sandbox-checkout/<orderId>`. The page plays the payment provider:

| Button                        | What happens                                              |
| ----------------------------- | --------------------------------------------------------- |
| Pay — callback and webhook    | Normal path: signed webhook, then signed browser callback |
| Pay — webhook only            | As if the renter closed the browser                       |
| Pay — callback only           | As if the webhook were delayed                            |
| Pay — webhook delivered twice | Exercises the inbox deduplication                         |
| Payment fails                 | The booking stays awaiting payment                        |
| Abandon checkout              | Back to the booking without paying                        |

The sandbox signs callbacks and webhooks with HMAC-SHA256 using the `SANDBOX_PAYMENT_*` secrets and sends
them through the real routes (`/api/payments/callback/sandbox`, `/api/payments/webhook/sandbox`), so the
same verification code runs as for a real provider. The webhook is posted to `APP_URL`, which is why
`APP_URL` must point at your running server.

A quick end-to-end walk-through:

1. Sign in as `rohan@peti.local`, open a listing, choose dates at least two days ahead and send a request.
2. In another browser profile, sign in as the owner (for example `aarav@peti.local`) and approve it from
   `/lend/requests`.
3. As Rohan, open the booking and pay; choose **Pay — callback and webhook**. The booking becomes
   confirmed and contact details appear.

## Background sweep

Deadlines, refunds, queued emails and review publication are handled by an idempotent sweep. In
production a scheduler calls it; locally, run it on demand while `pnpm dev` is running:

```bash
pnpm jobs:sweep
```

`scripts/sweep.ts` sends `POST /api/cron/sweep` to `APP_URL` with `Authorization: Bearer $CRON_SECRET` and
prints the status and the JSON report (expired requests and payments, auto-completed rentals, automatic
disputes, refunds sent, emails delivered, reviews published).

Deadlines use the real clock, so most of them (24-hour approval window, 12-hour payment window, 48-hour
inspection window) will not trigger during a short session.

## Optional: S3-compatible storage

The default filesystem storage needs nothing. To exercise the S3 adapter, start RustFS:

```bash
docker compose --profile s3 up -d
```

RustFS listens on port 9000 (API) and 9001 (console) with access key `peti-local` and secret
`peti-local-secret`. Create a bucket named `peti` (the app does not create buckets), then set in `.env`:

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=ap-south-1
S3_BUCKET=peti
S3_ACCESS_KEY_ID=peti-local
S3_SECRET_ACCESS_KEY=peti-local-secret
S3_FORCE_PATH_STYLE=true
```

Photos already stored on the filesystem are not copied across, so existing demo listings will show no
images once `STORAGE_DRIVER=s3`. The seed skips listings that already exist; to get the demo photos into
the bucket, reseed a fresh development database with the S3 settings in place (`pnpm db:reset`, then
`pnpm db:seed`).

## Useful commands

| Command             | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`          | Development server (Turbopack) on port 3000                                    |
| `pnpm check`        | Lint, typecheck, architecture boundaries, unit and component tests             |
| `pnpm format`       | Prettier write                                                                 |
| `pnpm db:generate`  | Regenerate the Prisma client                                                   |
| `pnpm db:migrate`   | `prisma migrate dev` against `DATABASE_URL`                                    |
| `pnpm db:deploy`    | `prisma migrate deploy` (non-interactive)                                      |
| `pnpm db:reset`     | Drop and recreate the **development** database from migrations (destroys data) |
| `pnpm db:seed`      | Demo data                                                                      |
| `pnpm db:drift`     | Fail if the migrations and `schema.prisma` disagree                            |
| `pnpm jobs:sweep`   | Run the background sweep once on the running server                            |
| `pnpm images:fetch` | Download the curated photo set and regenerate attributions (maintainers only)  |

## Windows notes

- Use pnpm from PowerShell, Git Bash or WSL. In PowerShell, `Copy-Item .env.example .env` replaces `cp`.
- Line endings are normalised to LF by `.gitattributes` (`* text=auto eol=lf`), so Prettier and the
  migration files behave the same as on Linux and CI. Configure your editor to keep LF.
- Docker Desktop must be running before `docker compose up -d`.
- `scripts/prepare-test-db.ts` already starts `pnpm` through a shell on Windows.

## Troubleshooting

| Symptom                                                                     | Fix                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Invalid environment configuration: …` on start                             | Read the listed variables; usually a missing secret or a `BETTER_AUTH_SECRET` shorter than 32 characters                                   |
| Port 5432 already in use                                                    | Stop the other PostgreSQL, or `POSTGRES_PORT=5433 docker compose up -d` and change the port in both `DATABASE_URL` and `DATABASE_URL_TEST` |
| Port 3000 already in use                                                    | `pnpm dev --port 3001` **and** set `APP_URL=http://localhost:3001`, otherwise sign-in links and sandbox webhooks go to the wrong port      |
| Cannot find module `@/generated/prisma/client`, or Prisma types out of date | `pnpm db:generate` (Prisma 7's `migrate dev` does not generate)                                                                            |
| `migrate dev` reports drift or asks to reset                                | Someone edited an applied migration or the database by hand. For the development database only, `pnpm db:reset` then `pnpm db:seed`        |
| `database "peti_test" does not exist`                                       | The init script only runs when the volume is first created: `docker compose exec postgres createdb -U peti -O peti peti_test`              |
| Sandbox payment does nothing / booking stays awaiting payment               | Check that `APP_URL` matches the running server and that the server logs show the webhook returning 200                                    |
| `pnpm jobs:sweep` prints `CRON_SECRET is not set` or `401`                  | Set `CRON_SECRET` in `.env` and restart `pnpm dev` so the server reads the same value                                                      |
| `/dev/outbox` returns 404                                                   | `APP_ENV` must be `local` or `test`                                                                                                        |
