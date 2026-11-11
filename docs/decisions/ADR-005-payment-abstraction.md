# ADR-005: Payment-provider abstraction and money model

- Status: Accepted
- Date: 2026-11-11

## Context

Renters pay a rental fee plus a refundable deposit. The deposit must be accounted for separately, refunds
must be tracked, owners are owed payouts, and the platform earns commission. The launch provider is likely
Razorpay (Orders → Checkout → signed callback and signed webhook). The MVP must be fully exercisable without
credentials, and must **never** mark a payment as successful without provider confirmation.

## Decision

1. **`PaymentProvider` port** in `payments/domain` with provider-neutral types: `createOrder`,
   `buildCheckoutSession` (`REDIRECT` or `CLIENT_SDK`), `verifyCheckoutCallback`, `parseWebhook` (raw body),
   `fetchPayment`, `findCapturedPaymentForOrder`, `createRefund` (idempotent on our refund id) and
   `fetchRefund`. No Razorpay types leak past the adapter.
2. **One payment order per booking** for fee plus deposit; the deposit is returned as a partial refund.
   - `payments`: `CREATED → AUTHORIZED → CAPTURED`, or `ABANDONED`; never downgraded.
   - `refunds`: an outbox — inserted `PENDING` in the business transaction, sent to the provider after
     commit.
   - `security_deposits`: `HELD → RELEASED | PARTIALLY_WITHHELD | FORFEITED`.
   - `payouts`: `PENDING → PAID`, marked paid by an admin with a reference. No money moves automatically.
3. **One `confirmPayment` use case** for both the browser callback and the webhook. It locks the booking then
   the payment, is a no-op if already captured, verifies amount and currency against the stored row, and only
   then moves the booking to `CONFIRMED`. A capture that arrives after the booking expired or was cancelled is
   recorded and fully refunded automatically (`LATE_CAPTURE_REVERSAL`).
4. **Webhook inbox** (`provider_events`, unique on provider and event id): the signature is checked over the
   raw body before anything is stored; duplicates are acknowledged without reprocessing; failures return 500
   so the provider retries.
5. **Sandbox provider** for local and test environments. It keeps its own state in
   `sandbox_provider_objects`, renders a checkout page at `/dev/sandbox-checkout/<orderId>`, and confirms
   payments by sending an **HMAC-signed callback and an HMAC-signed webhook through the same routes and
   verification code as production**. There is no `markPaid` shortcut. It is disabled in layers: env
   validation refuses `APP_ENV=production` with the sandbox provider or its secrets; secrets have no in-code
   defaults; its routes return 404 when it is not registered.
6. **Razorpay adapter** implements the port for test mode (`rzp_test_` keys only, enforced by env
   validation). Signature verification follows Razorpay's documented HMAC-SHA256 scheme and is unit-tested
   with computed vectors. It is not exercised against Razorpay in CI.
7. **No double-entry ledger in the MVP.** There is one payment per booking, one currency, no wallets and no
   netting. Conservation is enforced instead: for every closed booking with a captured payment,
   `captured = refunded + owner payout + commission`, exposed as `v_booking_money_reconciliation` and
   asserted in tests. Introduce a ledger together with real payouts, credits or promotions.

## Consequences

- The whole booking lifecycle, including failure modes (webhook only, callback only, duplicate webhook,
  failed payment, abandoned checkout, late capture), is testable locally and in CI.
- Moving to real marketplace settlement (for example Razorpay Route linked accounts) replaces the manual
  payout step, not the booking flow.
- Gateways usually keep their fee on refunded amounts, so deposits cost the platform money. This is recorded
  in [assumptions-and-risks.md](../product/assumptions-and-risks.md) for pricing decisions.
