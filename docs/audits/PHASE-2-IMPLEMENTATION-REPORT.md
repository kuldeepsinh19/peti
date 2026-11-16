# Peti — Phase 2 implementation report (real transactions and production readiness)

|                        |                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates                  | 2026-11-15 to 2026-11-16                                                                                                                                                                                       |
| Scope                  | Phase 2 of the roadmap in [MVP-AUDIT-REPORT.md](MVP-AUDIT-REPORT.md): make money handling reliable, design the real Razorpay path, add an SMS provider, harden payouts, and research compliance and operations |
| Starting commit        | `4793cfb` (Phase 1 report)                                                                                                                                                                                     |
| Final code commit      | `c23339e` (CI green on all three jobs)                                                                                                                                                                         |
| Decisions by the owner | Peti captures payments explicitly (manual capture). Build an MSG91 adapter, marked unverified. Migrate and redeploy the demo.                                                                                  |

**Bottom line: Peti is still NOT production-ready, and must not take real money.**

The money pipeline is now reliable **with the sandbox provider**, end to end and under concurrency. The
remaining blockers are outside the code:

- the real providers (Razorpay, MSG91) have never been exercised;
- the settlement model may itself need RBI authorisation (§6);
- tax, legal review and production operations are not in place.

**Evidence tags:**

- **[TEST]** a passing automated test against PostgreSQL 18 and the sandbox provider;
- **[MUT]** a test shown to fail when the protection is removed;
- **[RUN]** observed on a running server, the local production build or the live demo
  (`https://peti-kappa.vercel.app`);
- **[DOC]** written from the provider's documentation, never run against the provider.

---

## 1. Status of every Phase 2 item

| Status                              | Meaning                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| **Implemented and tested**          | In the code, covered by automated tests with the sandbox provider and a real database |
| **Sandbox-verified live**           | Also observed on the deployed demo                                                    |
| **Awaiting production credentials** | Code exists, but only a real provider account can show it works                       |
| **Blocked outside the code**        | Needs a lawyer, an accountant, a registration or money; no code change can resolve it |

### 1.1 Payment reliability

| Item                                                  | Status                                        | Evidence                                                                                   |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| S-04: duplicate and wrong-amount payments             | Implemented and tested; sandbox-verified live | [TEST] [MUT] §2.1                                                                          |
| Idempotent capture under concurrent reports           | Implemented and tested                        | [TEST] both webhooks + callback at once, 3 runs; exactly one capture                       |
| Duplicate webhooks                                    | Implemented and tested (unchanged inbox)      | [TEST] `200 duplicate`; dispute and refund events idempotent                               |
| Failed capture calls, lost capture responses          | Implemented and tested                        | [TEST] [MUT] retried every 15 min; a lost response is recovered by re-fetching             |
| Delayed payments at the deadline                      | Implemented and tested                        | [TEST] [MUT] one hour of grace while a capture is retried                                  |
| Payment reconciliation with the provider              | Implemented and tested; runs live             | [TEST] [MUT] [RUN] live sweep checked 6 orders, 0 errors                                   |
| S-06: refund webhook before the refund id is stored   | Implemented and tested                        | [TEST] [MUT] matched by our reference                                                      |
| Refunds whose webhook never arrives                   | Implemented and tested                        | [TEST] settled through `fetchRefund`                                                       |
| Refund retries that cannot be undone by late webhooks | Implemented and tested                        | [TEST] [MUT] compare-and-swap; a retry forgets the failed attempt                          |
| Transaction-safe money writes                         | Implemented and tested                        | Row locks (booking → payment), compare-and-swap, partial unique indexes, CHECK constraints |
| Full money audit history                              | Implemented and tested                        | [TEST] audit rows written in the same transaction; money timeline per booking              |

### 1.2 Real Razorpay architecture

| Item                                                         | Status                             | Evidence                                                                              |
| ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Manual-capture orders, capture, order payments, refund fetch | Awaiting production credentials    | [DOC] unit-tested against a stubbed SDK (9 tests)                                     |
| Callback and webhook signatures                              | Awaiting production credentials    | [DOC] unit-tested with independently computed HMACs (unchanged from the MVP)          |
| Refund idempotency (`notes.reference`)                       | Awaiting production credentials    | [DOC] [TEST] stubbed SDK                                                              |
| Dispute (chargeback) events                                  | Awaiting production credentials    | [DOC] [TEST] stubbed payloads                                                         |
| Commission                                                   | Implemented and tested (unchanged) | Settlement function, property-tested in the MVP                                       |
| Owner payouts through Razorpay Route                         | **Blocked outside the code**       | Route needs > ₹40 lakh turnover, and the settlement model needs legal review (§6)     |
| Sandbox and production strictly separated                    | Implemented and tested             | [TEST] env rules: sandbox refused in staging and production, `rzp_live_` keys refused |

### 1.3 SMS verification codes

| Item                                              | Status                          | Evidence                                                   |
| ------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Provider research                                 | Done                            | [sms-otp.md](../development/sms-otp.md)                    |
| Port that sends a code as a value (DLT templates) | Implemented and tested          | [TEST]                                                     |
| Dev adapter (outbox)                              | Implemented and tested          | [TEST] [RUN] the e2e sign-up verifies a phone through it   |
| MSG91 adapter                                     | Awaiting production credentials | [DOC] [TEST] [MUT] 7 tests against a stubbed `fetch`       |
| DLT registration, MSG91 account                   | **Blocked outside the code**    | About two weeks of lead time and ₹5,900; needs the company |

### 1.4 Owner payouts and financial operations

| Item                              | Status                       | Evidence                                                                         |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Payout only after settlement      | Implemented (unchanged)      | `settleMoney` creates the payout at completion, cancellation or dispute decision |
| One payout per booking; paid once | Implemented and tested       | [TEST] [MUT] unique index; two administrators at once → one success              |
| Refund and dispute interactions   | Implemented and tested       | [TEST] [MUT] an open chargeback holds the payout, re-checked in the write        |
| Failed payout recovery            | Implemented and tested       | [TEST] [MUT] `PAID → FAILED → PAID`, compare-and-swap, audited                   |
| Reconciliation and audit          | Implemented and tested       | [TEST] `v_booking_money_reconciliation`, `v_unexpected_captures`, money timeline |
| Automated payouts                 | **Blocked outside the code** | §6                                                                               |

### 1.5 Compliance research and the operations plan

| Item                                                              | Status                       | Where                                                                            |
| ----------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| GST, TDS, KYC, consumer protection, RBI PA rules, DPDP, contracts | Done, unreviewed             | [india-marketplace-compliance.md](../compliance/india-marketplace-compliance.md) |
| Production operations plan                                        | Done                         | [production-operations.md](../development/production-operations.md)              |
| Health, readiness and money-health endpoints; admin Money page    | Implemented and tested; live | [TEST] [RUN] §5                                                                  |

---

## 2. What changed, and why

### 2.1 S-04 — payments that do not fit the booking (High) — **Fixed** (sandbox)

**Root cause.**

- Razorpay was set to capture automatically, so every authorisation became money: a double tap, a retried
  UPI request, a payment after the booking expired.
- The schema has one `payments` row per booking, and refunds must reference it. A second captured payment had
  nowhere to live, so it could not go through the refund outbox.
- `recordCapturedPayment` threw `DUPLICATE_CAPTURE` / `AMOUNT_MISMATCH`, and the payments module only wrote
  an audit entry for an administrator to refund by hand.

**Fix** ([ADR-006](../decisions/ADR-006-payment-reliability.md)):

1. **Manual capture.** Orders are created with `payment.capture = "manual"` and a 24-hour capture window.
   Nothing is money until Peti captures it.
2. **Claim before capture.** `claimAuthorization` runs under the booking and payment row locks. It claims an
   authorisation only if the booking is `AWAITING_PAYMENT`, the payment row is `CREATED`, and the amount and
   currency are exact. Anything else is **declined**: audit-logged, never captured, and returned to the
   payer by the provider.
3. **Capture outside the transaction**, then record. If the capture call fails, Peti asks the provider: a
   capture that went through is recorded; an authorisation that can no longer be captured releases the
   claim; anything else is retried.
4. **Reversals.** A capture that still does not fit (made from the provider dashboard, for example) is never
   applied. It gets an `UNEXPECTED_CAPTURE_REVERSAL` refund naming the stray provider payment. A partial
   unique index makes it once per provider payment, and the dispatcher refunds that payment, never the
   booking's own. It is kept out of the booking's money (`refunded_paise`, reconciliation view) and listed in
   `v_unexpected_captures`.

**Tests** (`tests/integration/payments/payment-reliability.test.ts`, `review-fixes.test.ts`):

- two authorisations, delivered as two webhooks and a callback at once (3 runs): exactly one captured, the
  other left `authorized`, no refund created;
- a wrong amount is never captured, and the renter can then pay correctly;
- a second payment captured outside Peti: one reversal, refunded to the stray payment, booking untouched;
- the reconciliation view stays at zero imbalance with a reversal present.

### 2.2 S-06 and refund reliability (Medium) — **Fixed** (sandbox)

- **Matching.** Refund webhooks match by provider refund id, or by Peti's reference (`notes.reference`,
  our refund id) while the provider id was never stored. Reference matching is restricted to refunds that
  were sent (`INITIATED`), so a webhook cannot settle a refund that never left.
- **Lost webhooks.** The sweep fetches refunds still pending 30 minutes after they were sent or last checked,
  oldest first, and settles them.
- **No undoing.** Writes back from the dispatcher are compare-and-swap on `INITIATED`: a webhook that settled
  a refund first is never overwritten by the slower response. An administrator's retry forgets the failed
  attempt's provider id, so a late delivery about the old attempt cannot fail the retry.
- Every state change is audited in the same transaction (`refund.sent`, `refund.processed`,
  `refund.failed`).

### 2.3 Reconciliation

The sweep now asks the provider about every order created in the last 6 days (longer than any authorisation
can live): hourly, or every 15 minutes while a capture is being retried. What the provider reports goes
through the same pipeline as a webhook. The throttle uses database time.

A booking whose payment is authorised but not yet captured at the payment deadline is kept for one more hour
while the capture is retried, then expired. This was found in self-review after the first CI run: without
it, a renter who paid in time could lose the booking to a provider outage at the deadline.

### 2.4 Payouts and chargebacks

- `payment.dispute.*` webhooks are stored in `payment_disputes`, linked to the booking through its payment
  (or through a reversed stray payment). Concurrent deliveries fall through to an update, and a resolved
  dispute never reopens whatever order the events arrive in.
- An `OPEN` dispute holds the payout: `PAYOUT_ON_HOLD`, checked by the use case and again in the write.
- A payout recorded as paid that bounced can be recorded as `FAILED` with a reason, and paid again.

### 2.5 Operations surface

- `GET /api/health?ready=1`: configuration, a database ping and no half-applied migration; `503` otherwise.
- `GET /api/ops/money-health` (bearer `CRON_SECRET`, constant-time): ten counts, `200` when all are zero and
  `503` when any needs attention. Counts only.
- `/admin/money` lists the rows behind the counts; the admin booking page shows a money timeline.

### 2.6 SMS

- The port is now `sendOtp(to, { code, expiresInMinutes })`: under DLT the wording is a registered template,
  so only the code is the application's.
- The MSG91 adapter posts the template id and the code to the Send SMS (Flow) API, as MSG91's documentation
  describes. The key goes in a header and nothing secret goes in the URL. It times out after 10 seconds,
  treats HTTP 200 with `type: "error"` as a failure, and never puts the key, the number or the code in an
  error.
- `SMS_DRIVER=msg91` requires `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID`. Production still refuses the
  outbox.

---

## 3. Files changed

| Area                  | Files                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database              | `prisma/schema.prisma`; migrations `20261115173122_payment_reliability_enums`, `20261115173200_payment_reliability` (additive only)                                                                                                                                                                                                     |
| Payments              | `src/modules/payments/domain/payment-provider.ts`, `application/payments.ts`, `infrastructure/{razorpay-provider,sandbox-provider,prisma-payment-repository}.ts`                                                                                                                                                                        |
| Bookings              | `src/modules/bookings/application/{payment-events,ports,sweep,use-cases}.ts`, `index.ts`, `infrastructure/prisma-booking-store.ts`, `ui/booking-view.tsx`                                                                                                                                                                               |
| Admin and operations  | `src/modules/admin/application/{admin,money-health}.ts`, `index.ts`, `infrastructure/{prisma-admin-repository,prisma-money-queries}.ts`; `src/app/admin/{actions.ts,layout.tsx,money/page.tsx,payouts/page.tsx,bookings/[id]/*}`; `src/app/api/{health,ops/money-health,cron/sweep}/route.ts`; `src/app/_lib/bearer.ts`                 |
| SMS and configuration | `src/modules/notifications/application/ports.ts`, `infrastructure/{senders,msg91-sms-sender}.ts`; `src/modules/auth/infrastructure/better-auth.ts`; `src/config/env.ts`; `src/composition/container.ts`; `.env.example`                                                                                                                 |
| Sandbox checkout      | `src/app/dev/sandbox-checkout/[orderId]/{actions.ts,checkout-panel.tsx}`                                                                                                                                                                                                                                                                |
| Tests                 | New: `tests/integration/payments/{payment-reliability,payouts-and-chargebacks,money-health}.test.ts`, `tests/unit/payments/razorpay-adapter.test.ts`, `tests/unit/notifications/msg91-sms-sender.test.ts`, `tests/unit/shared/bearer.test.ts`. Changed: guards, lifecycle, review-fixes, auth-hardening, env, e2e booking, test support |
| Docs                  | New: ADR-006, `docs/compliance/india-marketplace-compliance.md`, `docs/development/{sms-otp,production-operations}.md`, this report. Changed: ADR-005, payment and security architecture, error handling, deployment and testing guides, `CLAUDE.md`, `README.md`                                                                       |

**Not changed:** no new dependencies, no new services, no destructive migrations. The existing booking
journeys pass unchanged (e2e).

**Behaviour changes to be aware of:**

- A late authorisation (after the booking expired) is no longer captured and refunded: it is never captured.
- Starting checkout while a payment is being captured is refused (`PAYMENT_PROCESSING`).
- The webhook no longer answers `200 flagged`; a stray capture is processed (`200 ok`) and reversed.
- The SMS port changed shape (`send` → `sendOtp`).

---

## 4. Test evidence (2026-11-16)

| Check                       | Result                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, layer rules    | Pass; 0 violations, 249 modules                                                                                                   |
| Unit + component            | **119 / 119** (was 100): Razorpay adapter 9, MSG91 7, bearer check 2, env 1                                                       |
| Integration (PostgreSQL 18) | **116 / 116** (was 79): payment reliability 17, payouts and chargebacks 9, money health 6, schema guards 3, changed regressions 2 |
| Schema drift                | None                                                                                                                              |
| Production build            | Pass                                                                                                                              |
| End to end (local)          | **11 / 11**                                                                                                                       |
| End to end (live demo)      | Booking journey **passed** after the hydration wait in `c23339e` (§5)                                                             |
| CI                          | `a9b036c` and `c23339e`: pass on quality, integration and end to end                                                              |

**Mutation checks [MUT]** — each protection removed, the relevant tests run, the protection restored. All 21
were caught:

| Protection                                                   | Protection                                                |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| One claim per booking (a second claim overwriting the first) | Claim requires the exact amount                           |
| A duplicate capture is reversed                              | The reversal refunds the stray payment, not the booking's |
| Refund matched by our reference (S-06)                       | Reference matching only for refunds that were sent        |
| A retry forgets the failed attempt                           | Authorised payments are retried every 15 minutes          |
| Reconciliation stops after 6 days                            | Reconciliation is throttled after each check              |
| Grace hour while a capture is retried                        | The grace ends after an hour                              |
| Payout hold checked by the use case                          | Payout hold re-checked in the write                       |
| A dispute never reopens                                      | Mark-paid is compare-and-swap                             |
| Payout failure is compare-and-swap                           | The money timeline is for administrators only             |
| MSG91: HTTP 200 with `type: "error"` fails                   | MSG91: digits masked in errors                            |
| MSG91: request timeout                                       |                                                           |

Two mutations survived on the first attempt, and both were dealt with:

- **"One claim per booking"** survived because the mutation was equivalent: a second authorisation was still
  declined, as `NOT_PAYABLE` instead of `ALREADY_PAID`. A stronger mutation, letting a second claim
  overwrite the first, was caught.
- **"A retry forgets the failed attempt"** was a real gap. A test now delivers the old failure again after
  the retry.

---

## 5. Live demo after migration and redeploy

**Migration.** `prisma migrate status` against the demo database listed exactly the two Phase 2 migrations
as pending. They were applied with `prisma migrate deploy`, which never resets. The temporary file holding
the database URL was deleted afterwards. The previous release kept serving through the migration (additive
schema) [RUN].

**Deployed:** `a9b036c` (the application code is unchanged by `c23339e`).

| Check                                                | Result [RUN]                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/health`                                    | `200 {"status":"ok"}`                                                                           |
| `GET /api/health?ready=1`                            | `200`, database ok, 7 migrations                                                                |
| `GET /api/ops/money-health` without / wrong secret   | `401` / `401`                                                                                   |
| `GET /api/ops/money-health` with the secret          | `200`, `ok: true`, all ten counts 0                                                             |
| `POST /api/cron/sweep` without / with the secret     | `401` / `200`; 6 orders reconciled with the provider, 0 errors                                  |
| `/dev/outbox`, `/dev/design-system`                  | `404` (locked demo)                                                                             |
| `/admin/money` signed out                            | Redirect to sign-in                                                                             |
| Booking journey (request → approval → pay → confirm) | **Passed**, as the seeded demo renter and owner                                                 |
| Database invariants (read-only)                      | 0 hold violations, 0 imbalances, 0 stray captures, 0 chargebacks, the 4 new constraints present |

**One failure on the way, and its cause.** The first live run of the booking journey stopped on the sandbox
checkout. Its "Pay" click landed before the page had hydrated, and did nothing. The database showed no
payment had been attempted on that order. A scripted run that waited for the page paid the same booking
through the UI, and it was confirmed. The e2e test now waits for the page to load (`c23339e`) and passes
against the live demo. This was a test timing problem, not a product fault, but a real renter on a slow
connection could meet the same dead click until the page loads.

The demo's sweep still runs **once a day** (Vercel Hobby). Reconciliation therefore runs daily there.

---

## 6. Remaining launch blockers (why this is not production-ready)

1. **Settlement model — possible RBI authorisation requirement.** Peti collects the fee and the deposit into
   its own account and an administrator pays owners by UPI. Under the RBI's payment-aggregator directions of
   15 September 2025, collecting money for sellers is payment-aggregator business. **This needs a lawyer's
   answer before anything else**, because the answer decides how money flows and therefore the data model
   ([compliance](../compliance/india-marketplace-compliance.md) §1).
2. **Split settlement is not available.** Razorpay Route needs more than ₹40 lakh turnover in FY 2025–26 or
   2024–25.
3. **The real providers have never been exercised.**
   - _Razorpay (test mode):_ manual-capture orders, the automatic return of uncaptured authorisations,
     refunds with `notes.reference`, refund and dispute webhook payloads, and `orders.fetchPayments`. The
     checklist is in the [deployment guide](../development/deployment-guide.md#razorpay-test-mode).
   - _MSG91:_ the request and especially the success response shape
     ([sms-otp.md](../development/sms-otp.md)).
4. **SMS registration.** DLT entity, header and template registration (about two weeks); MSG91 account and
   credentials.
5. **Tax.**
   - GST: Peti is probably an e-commerce operator that must register and collect TCS (0.5%), and its
     commission is probably taxable.
   - Income tax: TDS on owners' earnings unless Peti holds their PAN. Peti collects no PAN.
   - None of this is computed or recorded. These are questions for a chartered accountant.
6. **Legal.** Terms, privacy notice, deposit and damage rules, the grievance officer required by the
   Consumer Protection (E-Commerce) Rules, and DPDP obligations (notice, consent, erasure, breach reporting)
   from about May 2027.
7. **Operations.**
   - production hosting with S3/R2 storage;
   - a scheduler calling the sweep every 5 minutes (capture now depends on it as a safety net);
   - a monitor on the three health endpoints;
   - error tracking, a tested restore, an on-call person.
8. **Still open from the audit:** S-07 (crafted `?error=` text), S-08 (no site-wide Content-Security-Policy),
   S-09 (handover report replaceable until acknowledged), S-10 (no idle session timeout), the admin
   action/audit atomicity gap, identity verification of owners, and terms acceptance at sign-up.

Peti can be shown safely as a **demonstration with fictional data and sandbox payments**. It must not take
real users or real money until items 1–7 are resolved.

---

## 7. Residual risks introduced or accepted in Phase 2

| Risk                                                                                                                            | Severity          | Note                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Capture depends on Peti: if the callback, the webhook and the sweep all miss an authorisation for 24 hours, it lapses           | Medium            | The renter keeps their money; the booking is lost. Mitigated by the 5-minute sweep and the money-health monitor, neither set up yet |
| The Razorpay behaviour the design relies on is unverified                                                                       | High until tested | Test-mode checklist in the deployment guide; must pass before any launch                                                            |
| A declined second payment blocks the payer's funds until the provider releases it                                               | Low               | Up to the 24-hour window plus the bank's own delay; the renter is told it was not taken                                             |
| A booking can hold its dates for one hour past the payment deadline while a capture is retried                                  | Low               | Only when a payment is authorised in time and the capture call fails                                                                |
| A wrong-amount authorisation is declined, and audited, on each hourly reconciliation until the booking expires                  | Low               | At most about 13 audit rows; the payment is never captured                                                                          |
| A lost chargeback does not change the payout automatically                                                                      | Medium            | Shown on `/admin/money`; an administrator decides. The hold covers the `OPEN` period only                                           |
| Reference matching settles a sent refund with no stored provider id; a late failure about an older attempt could mark it failed | Low               | Never wrongly `PROCESSED`; an administrator retries. Needs a crash at a precise moment                                              |
| The monitoring endpoint shares the scheduler secret                                                                             | Low               | Anyone holding it can trigger the sweep, which is idempotent; separate the secrets if the monitor is a third party                  |
| Reconciliation calls the provider once per recent order per hour                                                                | Low at this size  | Batched at 25 per run; revisit at scale for provider rate limits                                                                    |
| The sandbox checkout's buttons do nothing until the page hydrates                                                               | Low (demo only)   | Seen on the live demo (§5); the real Razorpay checkout is a different page                                                          |

---

## 8. Commits

24 commits from `94da3c8` to `c23339e`, each typechecked on its own, in this order: schema; capture
pipeline; adapter tests; payment UI; refund reliability; reliability tests; reconciliation and its tests;
chargebacks; payout operations and their tests; bearer check; readiness; money health (module, endpoint,
pages); MSG91 adapter and configuration; ADR-006; architecture docs; compliance research; development docs;
the capture grace hour; the e2e hydration wait.
