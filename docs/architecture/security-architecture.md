# Security architecture

How Peti protects people, money and data, what an independent review found, and what is still open.
Reporting a vulnerability: [SECURITY.md](../../SECURITY.md). Operational settings:
[deployment guide](../development/deployment-guide.md).

## What is worth attacking

| Asset                              | Why it matters                                                            |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Renter payments and deposits       | Real money once live: confirmations, refunds, deposit settlement, payouts |
| The calendar                       | A double booking breaks a wedding outfit promise; it cannot be refunded   |
| Accounts                           | Taking over an owner or renter exposes contact details and bookings       |
| Phone numbers and pickup addresses | Revealed only to a confirmed counterparty; private otherwise              |
| Condition-report photos            | The evidence in damage disputes; must not be altered or leaked            |
| Administrator powers               | Suspend users, decide disputes, mark payouts paid                         |

## Actors and trust boundaries

- **Anonymous visitors** see live listings (locality only, never the street address) and public reviews.
- **Signed-in users** act as renter or owner per booking; "owner" and "renter" are relationships, not
  roles. Every use case derives identity from the session and checks the relationship
  (`requireRole`, `requireUser`, `requireAdmin`).
- **Administrators** (`role = admin`) moderate and decide. Their actions in the app are audit-logged.
- **The payment provider** reaches Peti through the signed browser callback and signed webhooks only.
- **The scheduler** calls `POST /api/cron/sweep` with a bearer secret.

The browser is never trusted: prices, totals, availability, ownership and payment status are recomputed or
re-checked on the server. `src/proxy.ts` only redirects anonymous visitors cheaply and hides `/dev/*`; it
is not the security boundary.

## Controls

### Authentication (Better Auth 1.7)

- Email and password with verification, password reset by email, phone verification by SMS OTP
  ([ADR-001](../decisions/ADR-001-technology-stack.md)). Database sessions; cookies are `Secure` when
  `APP_URL` is HTTPS.
- Phone-number endpoints the product does not use are disabled (`disabledPaths`): phone password reset and
  phone sign-in. `/phone-number/verify` is accepted only from a signed-in user updating their own number,
  so an OTP can never create a session.
- Auth endpoints are rate-limited per client IP in the database. The client IP comes from
  `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES`, which must match the real proxy
  ([deployment guide](../development/deployment-guide.md#client-ip-behind-a-proxy)).
- Suspending a user revokes their sessions and blocks sign-in (`getActor` also drops banned users). Their
  listings disappear from search and the detail page and cannot be requested.
- No identity documents are collected. `identity_verification_status` stays `UNVERIFIED`; the UI never
  claims identity verification.

### Authorisation

- Every use case authorises its actor. Booking, address, payout-account, inbox, review and saved-item reads
  and writes are scoped to the actor's id; admin use cases call `requireAdmin`.
- Contact details (phone, pickup address) are redacted until a booking is `CONFIRMED`.
- Condition-report photos are served through `/api/files` only to the two participants and administrators,
  with `Cache-Control: no-store` and `Content-Security-Policy: default-src 'none'`.

### Payments and money

See [payment architecture](payment-architecture.md) and [ADR-005](../decisions/ADR-005-payment-abstraction.md).

- `recordCapturedPayment` is the only path to `CONFIRMED`. Callbacks are HMAC-verified in constant time,
  then the payment is re-fetched from the provider; webhooks are HMAC-verified over the raw body and
  de-duplicated in the `provider_events` inbox. Amount and currency are checked against the stored payment.
- Money that does not fit a booking (a second capture, a different amount) is never applied: it is
  audit-logged as `payment.unexpectedCapture` and acknowledged, so the provider stops retrying.
- Settlement is one pure function that conserves money by construction (property-tested). Database checks
  forbid over-refunds, double settlement and refunds before capture; `v_booking_money_reconciliation` must
  show zero imbalance.
- The sandbox provider and its secrets are refused outside `local` and `test`; Razorpay accepts test-mode
  keys only.

### Data integrity

No double booking is enforced by an exclusion constraint, not by application code
([ADR-004](../decisions/ADR-004-booking-concurrency.md)). Booking status changes are checked by a trigger
against the transition table; pricing snapshots are immutable; history and audit tables are append-only
([database design](database-design.md)). Listing status writes are compare-and-swap.

### Input, files and output

- All external input is parsed with Zod at the boundary; raw SQL uses tagged templates only.
- Uploads: magic-byte check, size limit, re-encode with sharp (strips EXIF including GPS), random storage
  keys, path checks on read. Browsers downscale photos before upload; the server trusts none of it.
- Server Action errors return stable codes and messages; unexpected errors are logged with a short
  reference and shown as `INTERNAL_ERROR`. Logs never contain secrets, tokens, OTPs or payment payloads.
- Redirect targets taken from forms must be same-site paths (`isSafeReturnPath`).
- Security headers on every response (`nosniff`, `DENY` framing, referrer policy, permissions policy);
  HSTS on staging and production.

### Abuse limits

| Limit                                   | Where                                                 |
| --------------------------------------- | ----------------------------------------------------- |
| Sign-in, sign-up, OTP, password reset   | Better Auth, per client IP, stored in PostgreSQL      |
| Booking requests                        | `BOOKING_REQUEST_LIMIT` inside the use case, per user |
| Listing photos, condition reports       | `LIMITS` in `src/app/_lib/limits.ts`, per user        |
| Listings, disputes and dispute messages | `LIMITS`, per user                                    |
| Reviews, saved-outfit toggles           | `LIMITS`, per user                                    |

### Environment safety

`src/config/env.ts` validates configuration at start-up. Production refuses the sandbox provider, sandbox
secrets, the email and SMS outboxes, local-disk storage, a missing `CRON_SECRET` and live Razorpay keys.
`APP_ENV` fails closed (`NODE_ENV=production` without `APP_ENV` is production). Placeholder secrets from
`.env.example` are rejected outside `local` and `test`. `/dev/*` answers 404 from both the proxy and the
layout unless dev tooling is enabled.

## Review findings and fixes

An independent, read-only review of the code (authentication, authorisation, payments, money, files, SQL)
was run on 2026-11-12 after the MVP was feature-complete. Each fixed finding has a regression test, mostly
in `tests/integration/security/review-fixes.test.ts`.

| ID  | Severity  | Finding                                                                                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | High      | A renter could take the garment, never acknowledge it, cancel and get the whole deposit back; unacknowledged handovers were never escalated | **Fixed.** Renters and owners cannot cancel once the handover report exists or the start date has arrived (admins still can); the sweep turns a `CONFIRMED` booking past its end date into an admin-only `HANDOVER_FAILED` dispute. The review suggested cutting off from the day before the start; that would have removed most of the published "< 48 h" cancellation tier, so the cut-off is the report or the start date |
| H2  | High      | Unused Better Auth phone endpoints allowed brute-forcing an SMS password-reset code and passwordless SMS sign-in                            | **Fixed.** Endpoints disabled; `/phone-number/verify` requires a session and `updatePhoneNumber`                                                                                                                                                                                                                                                                                                                             |
| H3  | High      | No SMS provider: production would store OTPs in a table and never send them                                                                 | **Guarded.** Production refuses to start with the outbox SMS driver. A real provider is still required before launch                                                                                                                                                                                                                                                                                                         |
| M1  | Medium    | `APP_ENV` defaulted to `local`, so a missing variable enabled the sandbox provider and `/dev/outbox`                                        | **Fixed.** Fails closed under `NODE_ENV=production`; placeholder secrets rejected                                                                                                                                                                                                                                                                                                                                            |
| M2  | Medium    | Refunds stuck `INITIATED` after a crash, and failed refunds had no recovery                                                                 | **Fixed** (lease reclaim after 15 minutes; admin "Retry refund" on `/admin/payouts`, audit-logged). **Open:** a `refund.processed` webhook that arrives before the provider refund id is stored is not matched by our reference                                                                                                                                                                                              |
| M3  | Medium    | A second capture made the webhook fail and retry forever, with the money never refunded                                                     | **Partly fixed.** Flagged in the audit log and acknowledged; the refund is manual (in the provider dashboard). Automatic reversal of an unexpected capture is open                                                                                                                                                                                                                                                           |
| M4  | Medium    | Three phone photos exceed the 9 MB Server Action limit, so condition reports could not be uploaded                                          | **Fixed.** Browser-side downscaling to 2400 px JPEG before upload                                                                                                                                                                                                                                                                                                                                                            |
| M5  | Medium    | Auth rate limits keyed on a client-controlled or shared IP                                                                                  | **Configurable.** `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES`; must be set for the real host                                                                                                                                                                                                                                                                                                                                |
| L1  | Low       | Open redirect through `returnTo` (`//evil.com`)                                                                                             | **Fixed** (`isSafeReturnPath`)                                                                                                                                                                                                                                                                                                                                                                                               |
| L2  | Low       | `?error=` text is displayed as given, so a crafted link can show any message (React escapes it; no XSS)                                     | **Open.** Pass error codes and map them to messages                                                                                                                                                                                                                                                                                                                                                                          |
| L3  | Low       | Overlapping sweeps could send the same email twice                                                                                          | **Fixed.** Emails are sent while the row is locked (`SKIP LOCKED`) and marked in the same transaction                                                                                                                                                                                                                                                                                                                        |
| L4  | Low       | Missing rate limits on disputes, reviews and saved toggles; OTP sending limited per IP only                                                 | **Fixed** for app actions. **Open:** a per-phone-number OTP limit is needed before a real SMS provider (SMS pumping)                                                                                                                                                                                                                                                                                                         |
| L5  | Low       | An owner could accept an admin-opened damage claim in their own favour                                                                      | **Fixed.** Only claims a participant opened against the other can be accepted; others need an admin                                                                                                                                                                                                                                                                                                                          |
| L6  | Low       | Blind listing status writes: a stale owner pause could overwrite an admin suspension                                                        | **Fixed.** Compare-and-swap; a lost race returns `CONCURRENT_UPDATE`                                                                                                                                                                                                                                                                                                                                                         |
| L7  | Low       | The handover report can be replaced until the renter acknowledges it, and the acknowledgement is not tied to the version seen               | **Open.** Mitigated by the photos being timestamped and the report being visible to the renter; versioning the report is a follow-up                                                                                                                                                                                                                                                                                         |
| L8  | Low       | Sweep failures were swallowed silently                                                                                                      | **Fixed.** Reported in the sweep result and logged as `sweep step failed`                                                                                                                                                                                                                                                                                                                                                    |
| L9  | Low       | Razorpay status `refunded` is mapped to `CAPTURED` in the callback path                                                                     | **Open, low impact.** A refunded payment that is still unconfirmed would be confirmed; the booking's own refund rules then apply. Map it explicitly when Razorpay is exercised end to end                                                                                                                                                                                                                                    |
| L10 | Low       | Pickup address not snapshotted on the booking; suspended owners' listings searchable and requestable; invalid admin `?status=` caused a 500 | **Fixed** for suspended owners and the status filter. **Open:** the pickup address is read live (an owner editing it after confirmation changes what the renter sees)                                                                                                                                                                                                                                                        |
| S1  | Suspicion | `/dev/outbox` might be reachable by skipping the layout with a crafted RSC request                                                          | **Hardened.** `proxy.ts` answers 404 for `/dev/*` unless dev tooling is enabled; production refuses the outbox drivers anyway                                                                                                                                                                                                                                                                                                |
| S2  | Suspicion | Payments stay authorised if the Razorpay account uses manual capture                                                                        | **Documented.** Automatic capture must be enabled ([deployment guide](../development/deployment-guide.md#razorpay-test-mode))                                                                                                                                                                                                                                                                                                |
| S3  | Suspicion | Better Auth's own `/admin/*` endpoints (impersonate, set role, set password) bypass the app's audit log                                     | **Open, insider risk.** Restrict who holds the admin role; disable or wrap those endpoints with audit logging before launch                                                                                                                                                                                                                                                                                                  |

The review also checked and found sound: authorisation and IDOR scoping, the payment confirmation path,
raw SQL, file handling, settlement arithmetic, contact-detail redaction and phone-number changes.

## Open items before taking real users

1. A real SMS provider with DLT registration, and a per-number OTP limit (H3, L4).
2. Correct `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES` for the host (M5).
3. Automatic reversal of unexpected captures, and refund webhook matching by reference (M3, M2).
4. Audit logging or removal of Better Auth's admin endpoints (S3).
5. Error codes instead of message text in redirects (L2); versioned handover reports (L7); pickup address
   snapshot (L10); explicit `refunded` mapping (L9).
6. A site-wide Content-Security-Policy, error tracking and alerting on sweep failures, failed refunds and
   `payment.unexpectedCapture` entries.
7. A penetration test and a legal review of the terms, privacy policy and deposit rules.
