# Production operations

How to run Peti once it takes real bookings: what must be running, what to watch, and what to do when
something in the money pipeline needs a person. Deployment itself is in
[deployment-guide.md](./deployment-guide.md).

**Status.** The endpoints, pages and checks described here exist and are tested. The services around them
(a scheduler, a monitor, error tracking, backups, an on-call person) are **not set up**: this document says
what to set up. The public demo runs none of it; its sweep runs once a day.

## What must be running

| Component      | Requirement                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Application    | Node.js 24, `pnpm start`, behind a proxy that sets the client address header named in `AUTH_IP_HEADERS`                          |
| PostgreSQL 18  | Managed, with point-in-time recovery; extensions `btree_gist` and `pg_trgm`                                                      |
| Object storage | S3-compatible, private bucket, versioning on                                                                                     |
| **Scheduler**  | `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` **every 5 minutes**                                             |
| Monitor        | `GET /api/health?ready=1` every minute; `GET /api/ops/money-health` (bearer `CRON_SECRET`) every 5 minutes; alert on any non-200 |
| Email          | SMTP (`MAIL_DRIVER=smtp`)                                                                                                        |
| SMS            | MSG91 after DLT registration ([sms-otp.md](./sms-otp.md))                                                                        |
| Payments       | Razorpay, with the webhook pointed at `/api/payments/webhook/razorpay`                                                           |

### Why the scheduler matters more than before

Since [ADR-006](../decisions/ADR-006-payment-reliability.md), Peti captures payments itself. The callback
and the webhook normally do it within seconds, and the sweep is the safety net: it captures authorisations
those two missed, retries failed captures, finds stray captures, sends refunds and settles refunds whose
webhook was lost. **If the sweep stops, an authorised payment that the callback and webhook both missed
lapses after 24 hours**, and its booking expires unpaid.

A scheduler that runs once a day is not enough. Vercel's Hobby plan allows only daily cron jobs; use a paid
plan, or an external scheduler calling the endpoint.

## Health checks

| Endpoint                    | Checks                                                                  | Use for                                |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `GET /api/health`           | The process answers                                                     | Liveness (restart if it fails)         |
| `GET /api/health?ready=1`   | Configuration is valid, the database answers, no migration half-applied | Readiness and uptime monitoring        |
| `GET /api/ops/money-health` | The money pipeline (below). Needs the bearer secret.                    | Alerting on money that needs attention |

A failing readiness check answers `503 {"status":"unavailable"}` and writes the reason to the log, not to
the response.

## Money health

`GET /api/ops/money-health` answers `200` when every count is zero and `503` when any needs attention. The
body holds counts only. `/admin/money` shows the same counts with the rows behind them.

| Count                           | Means                                                            | First response                                                                 |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `reconciliationImbalances`      | A closed booking where captured ≠ refunded + payout + commission | Stop paying out. Open the booking's money timeline. This must never happen.    |
| `unexpectedCapturesOutstanding` | A stray capture whose refund has not reached the payer           | Usually clears on the next sweep. If the refund failed, retry it.              |
| `authorizationsWaiting`         | An authorised payment not captured after 3 attempts or an hour   | Check the provider's status page and the last error; the sweep keeps retrying. |
| `refundsFailed`                 | The provider refused a refund 5 times, or reported it failed     | Fix the cause with the provider, then **Retry refund** on `/admin/payouts`.    |
| `refundsNotSent`                | A refund queued for more than 2 hours                            | The sweep is not running. Check the scheduler.                                 |
| `refundsStuck`                  | A refund sent more than 10 days ago and still pending            | Ask the provider about it.                                                     |
| `chargebacksOpen`               | A cardholder disputed a payment                                  | Answer in the provider dashboard before its deadline. The payout is on hold.   |
| `payoutsFailed`                 | A payout came back and has not been sent again                   | Confirm the owner's UPI ID, then send again and record the new reference.      |
| `providerEventsFailed`          | A webhook failed processing in the last 7 days                   | Read the error on `/admin/money`. Reconciliation covers payments and refunds.  |
| `chargebacksLostRecently`       | Chargebacks lost in the last 30 days (shown, never alerts)       | Decide what happens to that booking's payout.                                  |

### Runbooks

**A renter paid twice.** Nothing to do. Peti captures one authorisation and leaves the other, which the
provider returns to the payer. If a second payment was somehow _captured_ (from the provider dashboard),
Peti queues a full refund of exactly that payment; it appears on `/admin/money` until the refund is
processed.

**A renter says they paid but the booking is not confirmed.** Open the booking in `/admin/bookings`. The
money timeline shows the payment's state, failed capture attempts and when the provider was last asked. If
the payment is `AUTHORIZED`, the sweep is retrying the capture. If it is `CREATED`, the provider has no
authorised payment for the order: the renter's bank declined or reversed it.

**A refund failed.** `/admin/payouts` → _Refunds that failed_ shows the provider's last error. Retrying is
safe: the provider call is idempotent on Peti's refund id, and a refund the provider already holds is reused
rather than created twice.

**A chargeback arrived.** The payout for that booking cannot be recorded as paid while it is open. Submit
evidence in the provider dashboard (the booking's condition reports and status history are the evidence).
When the provider reports the result, the hold ends. If it was lost, the renter has their money back: decide
whether the owner is still paid, and at whose cost.

**A payout bounced.** `/admin/payouts` → _Paid_ → **Record failure**, with the reason. The payout returns to
_To pay_. Ask the owner to correct their UPI ID, send it again and record the new reference.

**The sweep reports failures.** The response and the `sweep completed` log line list `bookings.failures`
(booking id, step, message). Each booking is retried on the next run; a failure that repeats needs a look.

## Deploys and migrations

- **Migrations before code:** `pnpm db:deploy` (`prisma migrate deploy`), then start the new version. Never
  `migrate dev` or `db:reset` against production.
- **Expand, then contract.** A migration must work with the code that is already running: add columns,
  tables and enum values first, deploy the code that uses them, and remove anything old in a later release.
  Every Phase 2 migration is additive.
- **Enum values** go in a migration of their own: PostgreSQL cannot use a new enum value in the transaction
  that adds it.
- `pnpm db:drift` (run in CI) fails when the schema and the migrations disagree.
- **Rolling back code** is safe across an additive migration. **Rolling back a migration** is a restore;
  write a forward fix instead.
- After a deploy, check `GET /api/health?ready=1` and `GET /api/ops/money-health`.

## Backups and restore

- Point-in-time recovery on the database; versioning on the bucket.
- **Practise the restore**: into a separate instance, at least quarterly, and time it. A backup that has
  never been restored is a hope.
- After a restore, the database has lost everything since the restore point, but the provider has not. Run
  the sweep: payment reconciliation re-reads every order from the last 6 days and applies what the provider
  reports. Then check `/admin/money`, and compare refunds and payouts made after the restore point against
  the provider dashboard and the bank statement by hand: **a payout recorded after the restore point is gone
  from the database but the money has been sent.**
- Keep `BETTER_AUTH_SECRET`, the provider keys and `CRON_SECRET` in a secret store, with their own backup.

## Logs and error tracking

- The application writes one JSON line per event to stdout and stderr. Ship them to a log service and keep
  them for at least 90 days.
- Alert on: `level":"error"`, `sweep step failed`, `payment callback failed`, `readiness check failed`.
- Logs never contain secrets, verification codes or full webhook payloads; stored webhooks have payer
  details removed.
- **Error tracking is not installed.** Sentry (or an equivalent) is the recommended next step: it adds a
  dependency and sends error data to a third party, so it needs a decision on what is sent and a
  data-processing agreement first.

## Secrets

| Secret                                           | Rotation                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                             | Signs everyone out                                                                 |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Rotate in the dashboard and the environment together; old webhooks then fail (401) |
| `CRON_SECRET`                                    | Update the scheduler and the monitor at the same time                              |
| `MSG91_AUTH_KEY`                                 | Rotate in MSG91; no other effect                                                   |
| Database and storage credentials                 | Per the provider                                                                   |

Sandbox payment secrets must not be set in production; the application refuses to start if they are.

## Not set up yet

- A scheduler that runs every few minutes, and a monitor on the three endpoints above.
- Error tracking, metrics and dashboards.
- An alert on unusual SMS volume or refund volume.
- A tested restore.
- An on-call rota and an incident log.
- A site-wide Content-Security-Policy.
