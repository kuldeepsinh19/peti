# Testing guide

What the test suites cover, how to run them, and why they are built the way they are. The guiding rule
from [CLAUDE.md](../../CLAUDE.md#12-testing-requirements): domain rules have unit tests, every write and
every database guard has an integration test against real PostgreSQL, journeys have end-to-end coverage,
and a critical test must be shown to fail when the guard it protects is removed.

See also: [local setup](local-setup.md), [ADR-004](../decisions/ADR-004-booking-concurrency.md),
[payment architecture](../architecture/payment-architecture.md),
[database design](../architecture/database-design.md).

## The pyramid

| Layer       | Location            | Runner                       | Environment                          | What it is for                                                                                                                                              |
| ----------- | ------------------- | ---------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `tests/unit`        | Vitest project `unit`        | Node                                 | Pure domain rules: state machines, pricing, settlement, cancellation tiers, IST date maths, money, env validation, Postgres error parsing                   |
| Component   | `tests/component`   | Vitest project `component`   | jsdom + Testing Library (`setup.ts`) | Interactive client components with business-visible behaviour: `request-form.test.tsx` covers the price preview, blocked and clashing dates, and submission |
| Integration | `tests/integration` | Vitest project `integration` | Node + real PostgreSQL `peti_test`   | Use cases and repositories end to end, database guards, concurrency, payment idempotency                                                                    |
| End to end  | `tests/e2e`         | Playwright                   | Production build + Chromium          | Core journeys and authorisation denials through the real UI and route handlers                                                                              |

Integration tests call use cases directly (wired as in production by `tests/integration/support/app.ts` and
`booking-app.ts`, with a fixed clock you can advance and the sandbox payment provider), including
`payments.handleWebhook` and `payments.handleCallback`. The HTTP route handlers and Server Actions
themselves are exercised by the e2e suite.

## Commands

| Command                 | What it runs                                           |
| ----------------------- | ------------------------------------------------------ |
| `pnpm test`             | `vitest run --project unit --project component`        |
| `pnpm test:unit`        | Unit tests only                                        |
| `pnpm test:component`   | Component tests only                                   |
| `pnpm test:integration` | Integration tests against `DATABASE_URL_TEST`          |
| `pnpm test:all`         | All three Vitest projects                              |
| `pnpm test:e2e`         | `playwright test` (needs `pnpm build` first)           |
| `pnpm check`            | `lint` + `typecheck` + `boundaries` + `test`           |
| `pnpm db:test:prepare`  | Apply migrations to the test database                  |
| `pnpm db:drift`         | Fail if migrations and `prisma/schema.prisma` disagree |

Pass a path or name filter to Vitest as usual, for example
`pnpm test:integration tests/integration/bookings/concurrency.test.ts`.

Vitest runs with `maxWorkers: 2`. Integration test files run one at a time (`fileParallelism: false`)
because they share one database; the test timeout is 30 s and the hook timeout 60 s.

## Preparing the test database

1. `docker compose up -d` — on first start the init script creates the `peti_test` database next to `peti`.
2. Set `DATABASE_URL_TEST` in `.env` (`.env.example` has `postgresql://peti:peti@localhost:5432/peti_test`).
3. Run:

   ```bash
   pnpm db:test:prepare
   ```

`scripts/prepare-test-db.ts` runs `prisma migrate deploy` with `DATABASE_URL` set to `DATABASE_URL_TEST`.
It is deliberately **deploy, never reset**: it only applies pending migrations, never drops anything, and
can be re-run after every pull. The integration setup file (`tests/integration/setup.ts`) refuses to run
without `DATABASE_URL_TEST`, points `DATABASE_URL` at it and sets `APP_ENV=test`, so integration tests can
never touch your development data.

### Truncate, do not roll back

`resetDatabase()` in `tests/integration/support/db.ts` truncates every application table (with
`CASCADE`) before each test. Reference data such as `booking_allowed_transitions` is left in place, and
because `TRUNCATE` does not fire row triggers it works on the append-only history and audit tables.

Tests are **not** wrapped in a rollback-per-test transaction. The concurrency tests need several
connections that see each other's committed rows — an exclusion constraint only blocks a second
transaction when the first one commits, and the callback-versus-webhook race needs two real transactions.
A test inside one uncommitted transaction cannot prove any of that.

## What the critical tests prove

### Concurrency and double booking — `tests/integration/bookings/concurrency.test.ts`, `tests/integration/database/guards.test.ts`

| Test                                                                                       | Proves                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| "blocks a concurrent overlapping insert until the first commits, then rejects it" (guards) | Two raw `pg` connections: B's overlapping hold waits on A's uncommitted row and fails with `23P01` on `calendar_holds_no_overlap` when A commits |
| "lets the waiting insert succeed when the first transaction rolls back" (guards)           | The same race resolves in B's favour if A rolls back                                                                                             |
| "rejects overlapping holds … but allows adjacent and other outfits" (guards)               | Half-open ranges: `[10,14)` and `[14,17)` do not overlap; other outfits are unaffected                                                           |
| "ON CONFLICT ON CONSTRAINT … DO NOTHING returns no row" (guards)                           | The hold insert used by the app returns nothing instead of aborting the transaction                                                              |
| "of ten overlapping requests approved at the same moment, exactly one wins"                | Ten concurrent approvals → one `AWAITING_PAYMENT`, nine `DATES_UNAVAILABLE`, one hold, one history row, hold invariant holds                     |
| "an owner's block and an approval racing for the same dates: exactly one wins"             | Owner blocks and bookings share one constraint, so a block cannot slip past an approval                                                          |
| "confirming a booking closes other pending requests for overlapping dates"                 | Pending competitors stay as backups after approval and are auto-rejected once payment confirms                                                   |

The hold invariant (`holdInvariantViolations()`) checks that a booking has a calendar hold if and only if
its status is a holding status ([ADR-004](../decisions/ADR-004-booking-concurrency.md)).

### Payments — `tests/integration/bookings/concurrency.test.ts`, `tests/integration/bookings/lifecycle.test.ts`

| Test                                                                                      | Proves                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "callback and webhook arriving together confirm exactly once (×10)"                       | Ten rounds of the race: exactly one `CONFIRMED` history row and one held deposit each time                                                      |
| "processes a duplicate webhook once and rejects tampered or unsigned ones"                | Second delivery answers `200 duplicate`; one `provider_events` row; tampered body or missing signature → `401 BAD_SIGNATURE` and nothing stored |
| "never confirms on a forged callback"                                                     | A bad signature yields `INVALID`; the booking stays `AWAITING_PAYMENT`                                                                          |
| "a failed payment leaves the booking awaiting payment and records the failure"            | `payment.failed` records the failure without changing the booking                                                                               |
| "confirms instead of expiring when the provider says the order was paid (reconciliation)" | The sweep asks the provider before expiring an unpaid booking                                                                                   |
| "refunds a capture that arrives after expiry, without reviving the booking"               | Late capture → booking stays `EXPIRED`, payment `CAPTURED`, full `LATE_CAPTURE_REVERSAL` refund, reconciliation balances to zero                |

### Lifecycle, money and rules — `tests/integration/bookings/lifecycle.test.ts`

- The happy path request → approve → pay → handover → return → complete, with money conserved.
- Late fees charged from the deposit and settled to the owner.
- Renter cancellation tiers (7+ days, within 48 hours) and owner cancellation (full refund, counted
  against the owner).
- Expiry of unanswered requests and unpaid approvals, releasing the dates.
- Refusal of self-rental, unverified renters, unknown durations and strangers; contact details hidden
  until payment.
- **"keeps the TypeScript transition table identical to the database's"** — compares
  `allowedPairs()` with the `booking_allowed_transitions` rows the trigger uses. The unit suite also checks
  the 16 seeded pairs.

Disputes (accepted damage claim, admin decision with audit entry, automatic `NOT_RETURNED` dispute after
three overdue days) are in `concurrency.test.ts` under "disputes".

### Database guards — `tests/integration/database/guards.test.ts`

Each guard is tested by writing directly to the database, bypassing the use cases, and asserting the
SQLSTATE and the constraint name that `pg-error.ts` extracts:

- `bookings_owner_not_renter` (check) and the composite foreign key tying a booking's owner to the outfit's
  owner (`23503`);
- `bookings_initial_status` and `bookings_legal_transition` triggers;
- `bookings_snapshot_immutable` (pricing snapshot cannot change);
- `bookings_one_pending_request` (unique, `23505`);
- append-only `booking_status_history` and `audit_logs` (UPDATE and DELETE rejected);
- refunds can never exceed the captured amount; deposit status consistent with the amount withheld.

### Unit tests — `tests/unit`

- `bookings/booking-domain.test.ts`: the state machine is checked exhaustively (every status × command ×
  role), terminal states have no exits, only the payment pipeline can confirm; lead-time and deadline
  rules in IST; pricing identities as a fast-check property; cancellation tiers; late-fee cap; and the
  **settlement conservation property** — for any rental fee, deposit, commission rate, retained fee and
  withheld amounts, refund + owner net + commission equals the captured amount.
- `shared/money.test.ts`: integer paise, half-up basis-point rounding checked against exact rational
  arithmetic (property test), Indian digit grouping.
- `shared/local-date.test.ts`: calendar dates, "today" in India rather than UTC.
- `shared/pg-error.test.ts`: SQLSTATE and constraint extraction from wrapped adapter errors and
  trigger-prefixed messages.
- `config/env.test.ts`: the production safety rules in `src/config/env.ts` (including fail-closed
  `APP_ENV`, placeholder secrets and the missing SMS provider).
- `listings/listing-domain.test.ts`: listing status machine and money rules.
- `payments/razorpay-signatures.test.ts`: the Razorpay checkout and webhook signature rules, checked against
  the published HMAC-SHA256 vector and signatures computed independently with `node:crypto` (raw-body
  tampering, wrong secret, missing headers, refund and ignored events).

Other integration files cover listings (draft → review → publish, ownership, re-review on content
changes, discovery filters) and trust (double-blind reviews, admin suspension with session revocation,
audited payouts).

### Security review regressions — `tests/integration/security/review-fixes.test.ts`

One test per finding of the independent review
([security architecture](../architecture/security-architecture.md#review-findings-and-fixes)): a second
capture is flagged for an admin rather than applied or retried; a refund stuck `INITIATED` is reclaimed only
after its 15-minute lease; a paid booking whose period ended without a handover becomes an admin-only
dispute; suspended owners' listings disappear from search and detail and cannot be requested; listing status
writes are compare-and-swap; two concurrent email dispatchers send each email once, and failures stop after
five attempts. `lifecycle.test.ts` adds the cancellation cut-off once the handover is recorded or the rental
has started.

## Mutation check

A test that cannot fail proves nothing. For every critical guard, break it on purpose and confirm the test
that claims to cover it goes red, then revert. This is a manual practice; there is no mutation-testing
tool in the project. ADR-004 records the result for the core guard: with the exclusion constraint
replaced by a non-conflicting constraint of the same name, the concurrency stress test fails. The
request-form component test was checked the same way (removing the cleaning-day term from the clash
check turns it red).

Never do this against your development or shared test database. Use a throwaway database:

```bash
docker compose exec postgres createdb -U peti -O peti peti_mutation
export DATABASE_URL_TEST=postgresql://peti:peti@localhost:5432/peti_mutation   # overrides .env
pnpm db:test:prepare

# Break a guard, e.g. drop the exclusion constraint …
docker compose exec postgres psql -U peti -d peti_mutation \
  -c "ALTER TABLE calendar_holds DROP CONSTRAINT calendar_holds_no_overlap;"

# … and confirm the tests that rely on it now fail.
pnpm test:integration tests/integration/database/guards.test.ts tests/integration/bookings/concurrency.test.ts

docker compose exec postgres dropdb -U peti peti_mutation
```

(`dotenv` does not override variables already set in the shell, so the exported `DATABASE_URL_TEST`
wins over `.env`.) For guards in code, make the change on a scratch branch — for example remove an
authorisation check or the "already captured" branch in `recordCapturedPayment` — run the relevant test,
see it fail, and discard the change.

## End-to-end tests

Specs live in `tests/e2e`:

| Spec              | Covers                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`   | Home page renders; `/api/health` responds                                                                                                                                                     |
| `auth.spec.ts`    | Sign-up, email confirmation and phone OTP via `/dev/outbox`, sign-out and sign-in; protected areas redirect to sign-in; generic wrong-password error; password reset through the emailed link |
| `booking.spec.ts` | Request → approval → sandbox payment → confirmation (contact details hidden before payment, shown after); a stranger gets 404 on someone else's booking; non-admins get 404 on `/admin`       |

Running them locally:

```bash
pnpm db:migrate && pnpm db:seed        # e2e uses DATABASE_URL (the seeded development database)
pnpm exec playwright install chromium  # once
pnpm build
pnpm test:e2e
```

Notes:

- `playwright.config.ts` starts `pnpm start --port 3100` (override with `E2E_PORT`) and waits for
  `/api/health`. It sets **`APP_ENV=test`**, `APP_URL` and `AUTH_TRUSTED_ORIGINS` for that server, so the
  dev tooling, sandbox provider and outbox are available and auth links point at the e2e server. The other
  variables come from `.env`.
- Locally an already-running server on that port is reused; in CI a fresh one is always started. Set
  `E2E_BASE_URL` to test an existing deployment-like server instead (no server is started).
- **Seeded data is required**: the booking journey signs in as `rohan@peti.local` and `aarav@peti.local`
  with the demo password and rents Aarav's "Antique gold brocade sherwani".
- **Chromium only**: the `desktop` project uses Desktop Chrome at 1440 × 900; the `mobile` project uses a
  Pixel 7 profile and runs only tests tagged `@mobile`.
- **One worker, not fully parallel**: journeys share seeded data, and the "cannot open someone else's
  booking" test relies on the booking created by the journey before it (it is skipped otherwise).
- Runs add users and bookings to the development database. The booking journey picks a random free date to
  avoid colliding with earlier runs; reseed (`pnpm db:reset && pnpm db:seed`) if the data gets crowded.
- In CI, `forbidOnly` is on, failing tests are retried once, traces are kept on failure and screenshots
  taken on failure; the HTML report is uploaded as an artefact.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests, with Node 24 and
`pnpm install --frozen-lockfile`. CI sets `APP_ENV=test`, the sandbox provider with CI-only secrets and a
CI-only `CRON_SECRET`.

| Job           | Needs     | Steps                                                                                                                                                  |
| ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quality`     | —         | `format:check`, `lint`, `typecheck`, `boundaries`, `test` (unit + component)                                                                           |
| `integration` | `quality` | PostgreSQL 18 service; `db:test:prepare`; `db:drift` (migrations match the schema); `test:integration`                                                 |
| `e2e`         | `quality` | PostgreSQL 18 service; `db:deploy`; `db:seed`; `build`; `playwright install --with-deps chromium`; `test:e2e`; uploads `playwright-report/` on failure |

In CI the integration job points `DATABASE_URL_TEST` at the service's `peti` database, since the service
container is created fresh for the job.

## Writing new tests

- A bug fix starts with a failing test.
- New writes get an integration test; new domain rules get unit tests; new database guards get a guard
  test asserting SQLSTATE and constraint name.
- Use `createUser`, `createOutfit` and friends from `tests/integration/support/db.ts`, and
  `buildBookingApp()` / `scenario()` from `booking-app.ts` for booking flows. Advance time with
  `app.clock.advance(ms)` rather than sleeping.
- Never assume test order inside Vitest, and never add a rollback-per-test wrapper.
