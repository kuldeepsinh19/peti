# Payment architecture

Decision record: [ADR-005](../decisions/ADR-005-payment-abstraction.md). Booking states referred to here are
described in [booking-lifecycle.md](./booking-lifecycle.md).

## Money rules

- All amounts are **integer paise** (`Paise`), stored in `integer` columns with CHECK constraints.
- Rates are basis points. Commission = `round_half_up(fee × bps / 10000)`, computed in one function.
- Pricing is **snapshotted on the booking** at request time and never changes afterwards.

| Snapshot column                                   | Meaning                                       |
| ------------------------------------------------- | --------------------------------------------- |
| `rental_days`, `rental_fee_paise`                 | The chosen duration option and its price      |
| `deposit_paise`                                   | Outfit deposit at request time                |
| `commission_rate_bps`, `commission_paise`         | Commission on the full fee (quoted)           |
| `renter_total_paise`                              | `rental_fee + deposit` — the amount charged   |
| `owner_payout_paise`                              | `rental_fee − commission` — the quoted payout |
| `late_fee_per_day_paise`                          | `ceil(1.5 × rental_fee / rental_days)`        |
| `buffer_days`, `terms_version`, `policy_snapshot` | The frozen rules both sides agreed to         |

## Flow

```mermaid
sequenceDiagram
  autonumber
  participant R as Renter browser
  participant A as Peti (Next.js)
  participant P as Payment provider
  R->>A: Start payment (booking AWAITING_PAYMENT)
  A->>A: insert payments row (CREATED)
  A->>P: createOrder(amount, reference = payment id)
  A-->>R: checkout session (redirect or client SDK)
  R->>P: pays
  par Browser callback
    P-->>R: signed callback params
    R->>A: POST /api/payments/callback/[provider]
    A->>A: verify signature, fetchPayment from provider
  and Webhook
    P->>A: POST /api/payments/webhook/[provider] (raw body + signature)
    A->>A: verify signature, store in provider_events (dedupe)
  end
  A->>A: confirmPayment (locks booking, then payment; idempotent)
  A->>A: booking CONFIRMED, deposit HELD
  A-->>R: 303 redirect to booking page (reads the database)
```

`confirmPayment` is the **only** path to `CONFIRMED`:

1. Find the payment by `(provider, provider_order_id)`.
2. Lock the booking, then the payment (`FOR UPDATE`).
3. If already `CAPTURED` with the same provider payment id, return — the other signal won the race.
4. Verify amount and currency against the stored row. The callback path fetches the payment from the
   provider first, because a valid signature proves authorisation, not capture.
5. Mark the payment `CAPTURED`. If the booking is `AWAITING_PAYMENT`, transition it to `CONFIRMED` and create
   the deposit (`HELD`). Otherwise queue a full refund (`LATE_CAPTURE_REVERSAL`).

The callback route is authenticated by signature only (the provider's POST is cross-site, so session cookies
may be absent) and never renders success from query parameters.

## Webhook inbox

1. Read the raw body (`request.text()`).
2. `provider.parseWebhook` verifies the signature. Invalid → `401`, nothing stored.
3. Insert into `provider_events` with `ON CONFLICT (provider, provider_event_id) DO NOTHING`. Already
   processed → `200`.
4. Process in a separate transaction; mark `PROCESSED`, or `FAILED` and return `500` so the provider retries.

A `payment.failed` event never downgrades a captured payment (UPI retries can fail first and succeed later).

## Settlement

One pure function (`deposits/domain/settlement.ts`) handles every exit. Inputs: the rental fee retained `F`
(0 to fee) and the deposit withheld `W` (0 to deposit).

| Output             | Formula                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| Refund to renter   | `(fee − F) + (deposit − W)`                                                    |
| Commission         | `round_half_up(F × bps / 10000)`                                               |
| Owner payout (net) | `F − commission + W` (no payout row when `F = W = 0`)                          |
| Deposit status     | `RELEASED` if `W = 0`, `FORFEITED` if `W = deposit`, else `PARTIALLY_WITHHELD` |

Deposit deductions (late fee, damage) go to the owner in full; commission applies only to the retained
rental fee.

| Exit                           | F          | W                |
| ------------------------------ | ---------- | ---------------- |
| Completed, no claim            | fee        | late fee         |
| Renter cancels ≥ 7 days before | 0          | 0                |
| Renter cancels 48 h–7 days     | 50% of fee | 0                |
| Renter cancels < 48 h          | fee        | 0                |
| Owner cancels                  | 0          | 0                |
| Claim accepted                 | fee        | late fee + claim |
| Admin decision                 | as decided | as decided       |

**Conservation invariant**, asserted in tests and visible to admins through
`v_booking_money_reconciliation`: for every closed booking with a captured payment,

```
captured = refunded + owner payout (net) + commission
```

## Refunds

Refund rows are their own outbox. The business transaction inserts the row as `PENDING`, splits it into
`rental_fee_portion` and `deposit_portion`, and increments `payments.refunded_paise` (a CHECK keeps it at or
below the captured amount). After commit, the sweep sends pending refunds to the provider using the refund id
as the idempotency reference. Provider calls never happen inside a database transaction.

## Payouts

A payout row (`PENDING`) is created at settlement. In the MVP an admin pays the owner outside the platform
(for example by UPI) and marks the payout `PAID` with a reference; this is audit-logged. Automated payouts
need the provider's marketplace product (Razorpay Route) and are out of scope.

## Providers

| Provider   | Where                             | Notes                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sandbox`  | `APP_ENV=local` or `test` only    | Checkout page at `/dev/sandbox-checkout/<orderId>` with outcomes: pay (callback and webhook), webhook only, callback only, duplicate webhook, fail, abandon. Signs callbacks and webhooks with HMAC-SHA256 using `SANDBOX_PAYMENT_*` secrets and sends them through the real routes. |
| `razorpay` | Test mode only (`rzp_test_` keys) | Orders API; Checkout.js; callback signature `HMAC_SHA256(order_id + "                                                                                                                                                                                                                | " + payment_id, key_secret)`using the server-stored order id; webhook signature`HMAC_SHA256(raw_body, webhook_secret)`; event id from `x-razorpay-event-id`. |

Known commercial risk: gateways usually keep their fee on refunded amounts, so refunding a deposit costs the
platform money. See [assumptions-and-risks.md](../product/assumptions-and-risks.md).
