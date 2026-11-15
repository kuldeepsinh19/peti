# ADR-006: Payment reliability — explicit capture, reversals, reconciliation

- Status: Accepted
- Date: 2026-11-15
- Amends: [ADR-005](./ADR-005-payment-abstraction.md) (the port and the handling of unexpected captures)

## Context

[ADR-005](./ADR-005-payment-abstraction.md) gives each booking one `payments` row and treats a capture as a
fact reported by the provider. The MVP audit found the gaps this leaves (findings S-04 and S-06):

- **A second payment had nowhere to go.** With automatic capture, the provider captures every authorisation:
  a double tap, a retried UPI request, or a payment that arrives after the booking expired. A second or
  wrong-amount capture was only written to the audit log for an administrator to refund by hand.
- **A lost webhook was final.** A refund whose webhook never arrived stayed `INITIATED` for ever; a late
  capture on a closed booking was never found; an authorised but uncaptured payment was ignored.
- **A refund could be sent and forgotten.** A worker that died between the provider call and storing the
  provider's refund id left a refund that no webhook could be matched to.
- **Payouts had no failed state**, and nothing stopped a payout while the payment was under a chargeback.

## Decision

1. **Peti captures explicitly.** Orders are created for manual capture (Razorpay: `payment.capture =
"manual"` on the order, which overrides the dashboard setting, with a 24-hour capture window). An
   authorisation becomes money only when Peti captures it, and Peti captures **one payment per booking**.
   Anything it does not capture is returned to the payer by the provider. Most stray payments therefore
   never reach Peti's account at all.
2. **One pipeline for every report of a payment.** The browser callback (after fetching the payment from the
   provider), the signed webhook and reconciliation all call `applyProviderPayment`:
   - `AUTHORIZED` → **claim**, then capture, then record. The claim is a compare-and-swap under the booking
     and payment row locks: the booking must be `AWAITING_PAYMENT`, the payment row `CREATED`, and the amount
     and currency exact. A claim that fails is written to the audit log (`payment.authorizationDeclined`)
     and the authorisation is left alone. The capture call happens outside any transaction; if it fails, the
     provider is asked what happened, because the capture may have succeeded.
   - `CAPTURED` → record. The booking is confirmed; or, if it has stopped waiting for payment, refunded in
     full (`LATE_CAPTURE_REVERSAL`, as before); or, if it is a second payment or the wrong amount,
     **reversed**.
3. **Reversals go through the refund outbox.** A capture that cannot be applied gets a refund row with reason
   `UNEXPECTED_CAPTURE_REVERSAL` and `reversed_provider_payment_id` naming the stray payment. A partial
   unique index makes it once per provider payment. It does not touch `payments.refunded_paise` and is
   excluded from `v_booking_money_reconciliation`: that money was never the booking's. The dispatcher refunds
   `COALESCE(reversed_provider_payment_id, payments.provider_payment_id)`.
4. **Reconciliation is part of every sweep.**
   - _Payments:_ every order created in the last 6 days is checked with the provider (`listOrderPayments`)
     hourly, or every 15 minutes while an authorisation is being captured. What the provider reports goes
     through the same pipeline.
   - _Refunds:_ a refund still pending 30 minutes after it was sent, or last checked, is fetched from the
     provider and settled.
5. **Refund webhooks match by provider refund id or by our reference** (the refund's notes carry
   `refunds.id`), the latter only while the provider id was never stored. Writes back from the dispatcher
   are compare-and-swap on `INITIATED`, so a webhook that already settled a refund is never undone.
6. **Chargebacks are recorded and hold payouts.** `payment.dispute.*` events are stored in
   `payment_disputes`, linked to the booking. A resolved dispute never reopens. A payout cannot be marked
   paid while a dispute on the booking's payment is `OPEN`; the check is repeated in the write.
7. **Payouts can fail.** `PAID → FAILED` with a reason when a transfer bounces; a `FAILED` payout is paid
   again from the same queue. Both transitions are compare-and-swap and audit-logged.
8. **Every money event is audited** in the transaction that causes it, and the money pipeline's health is
   one query, served to administrators (`/admin/money`) and to a monitor (`GET /api/ops/money-health`).

## Consequences

**Good**

- A double payment costs the renter nothing and needs no human: one authorisation is captured, the other
  lapses. A capture made outside Peti is refunded automatically, with an audit trail.
- A lost webhook delays an outcome by at most one reconciliation interval instead of losing it.
- The conservation invariant (`captured = refunded + owner payout + commission`) still holds for every
  closed booking, because reversals are accounted for separately (`v_unexpected_captures`).

**Costs and limits**

- **Capture is now Peti's job.** If the sweep does not run and the callback and webhook are both lost, an
  authorisation lapses after 24 hours and the booking expires unpaid. The renter keeps their money; the
  booking is lost. Production needs the sweep every few minutes
  ([production-operations.md](../development/production-operations.md)).
- **One more provider call per payment** (capture), and one `listOrderPayments` call per recent order per
  hour.
- **An authorisation blocks the payer's funds** until the provider releases it (provider- and bank-dependent,
  up to the 24-hour window plus the bank's own delay).
- **Reversal refunds cost gateway fees**, like every refund. They are now rare, since manual capture stops
  most stray payments before capture.
- **A lost chargeback is not recovered automatically.** The payout hold ends when the dispute leaves `OPEN`;
  if it was lost, an administrator decides what happens to the payout. `/admin/money` lists recent losses.
- **Not verified against Razorpay.** The adapter follows the official documentation and is unit-tested
  against a stubbed SDK; the behaviour above is verified end to end only with the sandbox provider. In
  particular the manual-capture order options, the automatic return of uncaptured authorisations and the
  dispute webhook payloads must be confirmed in Razorpay test mode before launch.

## Alternatives considered

- **Keep automatic capture and refund every stray capture.** Simpler, but every double tap becomes a real
  charge, a refund that takes days and a gateway fee, and it relies on a refund path for something that need
  not have happened.
- **Several payment rows per booking.** A truer model of provider payments, but it changes the meaning of
  `payments` for every reader (deposits, refunds, reconciliation, the booking page) to describe money that is
  never the booking's. A reversal row carries the one fact that matters: which provider payment to send back.
- **A job queue for capture.** The sweep, the webhook retry and the callback already give three attempts at
  different times; a queue would add an operational dependency without a fourth guarantee.
