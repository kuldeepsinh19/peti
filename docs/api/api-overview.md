# API overview

Peti has no public JSON API for listings or bookings. The browser talks to the server in two ways:

1. **Server Actions** — every mutation made from the UI (forms and buttons).
2. **HTTP route handlers** under `src/app/api` — only for things that cannot be a Server Action: the auth
   endpoints, payment-provider callbacks and webhooks, file serving, the scheduled sweep and a health check.

Reads are done by Server Components, which call query functions on the container
(`src/composition/container.ts`) and render HTML; they are not an API surface.

Related reading: [error handling](error-handling.md), [system architecture](../architecture/system-architecture.md),
[payment architecture](../architecture/payment-architecture.md),
[booking lifecycle](../architecture/booking-lifecycle.md).

## Request path

```
Form (React Hook Form + Zod contract, client-side feedback only)
  → Server Action in src/app/**/actions.ts      (thin: no business rules)
  → runAction(name, body)                       src/app/_lib/action.ts
      resolves the actor from the session       src/composition/session.ts (getActor)
      no session → UNAUTHENTICATED
  → use case from container()                   src/modules/<name>/application/*
      parseInput(contract, input)               re-validates with the same Zod schema
      authorises the actor (owner / participant / admin)
      applies domain rules                      src/modules/<name>/domain/*
      writes through a repository / unit of work (Prisma, Postgres constraints as the last guard)
  → ActionResult<T>  or  redirect(...?done=… | ?error=…)
  → revalidatePath(...) for the affected pages
```

Key points:

- **The actor comes only from the session.** `getActor()` validates the Better Auth session cookie against
  the database on every request and builds a `UserActor` (`userId`, `isAdmin`, `emailVerified`,
  `phoneVerified`, …). Suspended (banned) users resolve to no actor. Nothing in the request body can
  change who the actor is.
- **Authorisation lives in the use case**, not in the action, the page or `src/proxy.ts` (which only
  redirects visitors without a session cookie). "Owner" and "renter" are relationships to a specific outfit
  or booking, checked per call; the only roles are `user` and `admin`.
- **Input is validated twice with one contract.** The form uses the Zod schema for instant feedback; the
  use case re-parses whatever arrives with `parseInput`, which turns failures into a `ValidationError`
  with field errors. Prices, totals, availability and ownership are always recomputed on the server.
- **Errors are typed.** Actions never throw to the browser; see [error handling](error-handling.md).

### ActionResult

`src/shared/contracts/action-result.ts`:

```ts
type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

interface ActionError {
  code: string; // stable code, e.g. "DATES_UNAVAILABLE", "VALIDATION_FAILED", "INTERNAL_ERROR"
  message: string; // safe to show to the user
  fieldErrors?: Record<string, string[]>; // only for VALIDATION_FAILED
}
```

Actions come in two styles:

| Style                 | Returns                                                                   | Used by                                                    |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Typed result          | `Promise<ActionResult<T>>`                                                | Client components (forms that show field errors inline)    |
| Form post with a flag | `Promise<void>`; redirects to a page with `?done=…` or `?error=<message>` | Plain `<form action>` buttons that work without JavaScript |

A few form-post actions (noted below) neither redirect nor return a result; on failure they only
revalidate the page.

## Server Actions

All actions are in files marked `"use server"`. Every action except the dev sandbox one runs through
`runAction`, so an anonymous caller always gets `UNAUTHENTICATED`.

### Account

| Action                    | File                                              | Use case                  | Who may call                                                   | Returns / effect                                                  |
| ------------------------- | ------------------------------------------------- | ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `updateProfileAction`     | `src/app/account/actions.ts`                      | `users.updateProfile`     | Any signed-in user (own profile only)                          | `ActionResult<undefined>`; revalidates the root layout            |
| `addAddressAction`        | `src/app/account/actions.ts`                      | `users.addAddress`        | Any signed-in user                                             | `ActionResult<{ id }>`; at most 5 addresses (`ADDRESS_LIMIT`)     |
| `removeAddressAction`     | `src/app/account/actions.ts`                      | `users.removeAddress`     | Any signed-in user (own addresses)                             | `void`; revalidates `/account/addresses`; errors are not surfaced |
| `setDefaultAddressAction` | `src/app/account/actions.ts`                      | `users.setDefaultAddress` | Any signed-in user (own addresses)                             | `void`; revalidates `/account/addresses`; errors are not surfaced |
| `submitReviewAction`      | `src/app/account/reviews/page.tsx` (inline)       | `reviews.submit`          | Renter or owner of a `COMPLETED` booking, once, within 14 days | Redirect to `/account/reviews?done=1` or `?error=`                |
| `markAllReadAction`       | `src/app/account/notifications/page.tsx` (inline) | `inbox.markAllRead`       | Any signed-in user (own notifications)                         | `void`                                                            |
| `toggleSavedAction`       | `src/app/(site)/outfits/actions.ts`               | `search.toggleSaved`      | Any signed-in user                                             | `void`; revalidates the outfit page and `/account/saved`          |

### Lend (listings, calendar, payouts)

| Action                    | File                              | Use case                                                                                             | Who may call                                                                 | Returns / effect                                                                                                               |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `createListingAction`     | `src/app/lend/(owner)/actions.ts` | `listings.createListing`                                                                             | Any signed-in user                                                           | `ActionResult<{ redirectTo }>` → `/lend/outfits/<id>/edit?created=1#photos`                                                    |
| `updateListingAction`     | `src/app/lend/(owner)/actions.ts` | `listings.updateListing`                                                                             | Owner of the outfit                                                          | `ActionResult<{ redirectTo }>` → `…/edit?saved=1`, or `?saved=review` when a content change sent a live listing back to review |
| `uploadPhotoAction`       | `src/app/lend/(owner)/actions.ts` | `listings.addPhoto`                                                                                  | Owner; rate-limited to 40 uploads per hour per user                          | `ActionResult<{ id }>`; JPEG/PNG/WebP up to 8 MB, at most 8 photos per listing; re-encoded and EXIF stripped                   |
| `removePhotoAction`       | `src/app/lend/(owner)/actions.ts` | `listings.removePhoto`                                                                               | Owner                                                                        | `ActionResult<undefined>`; a live listing keeps at least one photo                                                             |
| `listingStatusAction`     | `src/app/lend/(owner)/actions.ts` | `listings.submitForReview` / `withdrawFromReview` / `pause` / `resume` / `archive` (field `command`) | Owner; submitting also needs verified email and phone and at least one photo | `void`; on failure redirects to `/lend/outfits/<id>/edit?error=`                                                               |
| `savePayoutAccountAction` | `src/app/lend/(owner)/actions.ts` | `users.savePayoutAccount`                                                                            | Any signed-in user                                                           | Redirect to `/lend/earnings?saved=1` or `?error=`                                                                              |
| `calendarBlockAction`     | `src/app/_actions/bookings.ts`    | `bookings.addOwnerBlock`, or `bookings.removeOwnerBlock` when `intent=remove`                        | Owner of the outfit                                                          | Redirect to `/lend/outfits/<id>/calendar?done=1` or `?error=`; a new block auto-declines overlapping pending requests          |

### Bookings

| Action                  | File                           | Use case                                                                                     | Who may call                                                                      | Returns / effect                                                                                                                                |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestBookingAction`  | `src/app/_actions/bookings.ts` | `bookings.request`                                                                           | Signed-in user with verified email and phone, not the owner; 10 requests per hour | `ActionResult<{ redirectTo }>` → `/account/rentals/<id>?requested=1`                                                                            |
| `bookingCommandAction`  | `src/app/_actions/bookings.ts` | `bookings[command]` (see below)                                                              | Depends on the command                                                            | Redirect to `returnTo` (must start with `/`) with `done=<command>` or `error=`                                                                  |
| `conditionReportAction` | `src/app/_actions/bookings.ts` | `bookings.submitHandoverReport` (`kind=HANDOVER`) or `bookings.recordReturn` (`kind=RETURN`) | Owner (return: owner or admin); 20 report uploads per hour                        | `ActionResult<undefined>`; 3–10 photographs (multipart field `photos`)                                                                          |
| `startCheckoutAction`   | `src/app/_actions/bookings.ts` | `payments.startCheckout`                                                                     | The renter of an `AWAITING_PAYMENT` booking                                       | `ActionResult<CheckoutSession>`: `{ mode: "REDIRECT", url }` (sandbox) or `{ mode: "CLIENT_SDK", scriptUrl, publicConfig }` (Razorpay Checkout) |

`bookingCommandAction` reads `command` from the form and dispatches to one use case. The use case decides
whether this actor may do this now; the role column reflects the checks in
`src/modules/bookings/application/*`.

| `command`             | Use case file  | Allowed roles                                                           | Transition / effect                                              |
| --------------------- | -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `approve`             | `decisions.ts` | Owner only (admins cannot approve)                                      | `PENDING_APPROVAL → AWAITING_PAYMENT`; inserts the calendar hold |
| `reject`              | `decisions.ts` | Owner, admin                                                            | `PENDING_APPROVAL → REJECTED`                                    |
| `withdraw`            | `decisions.ts` | Renter, admin                                                           | Withdraws a request                                              |
| `cancel`              | `decisions.ts` | Renter, owner, admin (admin must send `reason` and `retainedFeeRupees`) | Cancels; after payment, refunds by policy and settles            |
| `acknowledgeHandover` | `rental.ts`    | Renter, admin                                                           | `CONFIRMED → ACTIVE` after the owner's handover report           |
| `confirmReturn`       | `rental.ts`    | Owner, admin                                                            | `RETURNED → COMPLETED` with settlement                           |
| `openDispute`         | `disputes.ts`  | Renter, owner, admin (kinds depend on state and role)                   | Opens a dispute; booking becomes `DISPUTED`                      |
| `acceptClaim`         | `disputes.ts`  | The respondent (renter or owner who did not open it)                    | Settles a post-return claim as made                              |
| `withdrawDispute`     | `disputes.ts`  | The person who opened it                                                | Settles as if the return had been confirmed                      |
| `resolveDispute`      | `disputes.ts`  | Admin                                                                   | Completes or cancels with explicit amounts; audit-logged         |
| `addDisputeMessage`   | `disputes.ts`  | Renter, owner, admin                                                    | Adds a message to the open dispute                               |

Strangers to a booking get `NOT_FOUND`, never `FORBIDDEN`, so booking ids cannot be probed. Unknown
`command` values are ignored. The full transition table is in
[booking-lifecycle.md](../architecture/booking-lifecycle.md).

### Admin

Both actions are in `src/app/admin/actions.ts`; every use case calls `requireAdmin` and writes an audit log
entry.

| Action                  | `command` values                                                                                                                                    | Use case                                                | Returns / effect                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `moderateListingAction` | `approve`, `reject`, `suspend`, `reinstate` (`reject` and `suspend` need `note`)                                                                    | `listings.approve` / `reject` / `suspend` / `reinstate` | Redirect to `/admin/listings?done=<command>` or `?error=`                                               |
| `adminCommandAction`    | `suspendUser`, `reinstateUser` (both need `reason`), `markPayoutPaid` (`reference`), `retryRefund` (`refundId`), `createCategory`, `toggleCategory` | `admin.*` in `src/modules/admin/application/admin.ts`   | Redirect to `/admin/users`, `/admin/payouts` or `/admin/categories` with `?done=<command>` or `?error=` |

`resolveDispute` and admin cancellations go through `bookingCommandAction`.

### Dev sandbox

| Action                    | File                                                | Effect                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completeSandboxCheckout` | `src/app/dev/sandbox-checkout/[orderId]/actions.ts` | Plays the payment provider for one sandbox order. Outcomes: `pay`, `pay-webhook-only`, `pay-callback-only`, `pay-duplicate-webhook`, `fail`. Records the payment on the sandbox side, POSTs the signed webhook(s) to `APP_URL/api/payments/webhook/sandbox` over HTTP, and returns `{ callback, callbackUrl, webhookStatuses }`; the page then submits the signed callback as a real form POST. |

It does not use `runAction` and does not resolve an actor. It refuses to run unless dev tooling is enabled
(`APP_ENV` is `local` or `test`) and the sandbox provider is configured; the whole `/dev` area returns 404
otherwise. It cannot mark a booking as paid by itself: confirmation still happens only through the signed
callback and webhook routes.

## HTTP route handlers

All handlers are `force-dynamic`. Errors from route handlers are plain-text bodies, not `ActionResult`.

### `GET|POST /api/auth/[...all]` — Better Auth

`src/app/api/auth/[...all]/route.ts` delegates to Better Auth (`src/modules/auth/infrastructure/better-auth.ts`).
The UI calls it through the Better Auth client (`src/modules/auth/ui/auth-client.ts`); the endpoint paths
are Better Auth's own.

| Aspect             | Configuration                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Sign-in            | Email and password (10–128 characters); auto sign-in after sign-up                         |
| Sessions           | Database sessions, 14 days, refreshed daily; secure cookies when `APP_URL` is `https://`   |
| Email verification | Link sent on sign-up, valid 1 hour                                                         |
| Password reset     | Link valid 1 hour; resets revoke other sessions                                            |
| Phone verification | `phoneNumber` plugin: 6-digit OTP, valid 5 minutes, 5 attempts, Indian mobile numbers only |
| Roles and bans     | `admin` plugin (`user` / `admin`); a banned user cannot sign in                            |
| Trusted origins    | `APP_URL` plus the comma-separated `AUTH_TRUSTED_ORIGINS`                                  |

Rate limits are stored in the database (default 100 requests per 60 s). Stricter rules, multiplied by 20
when `APP_ENV=test` (except phone verification):

| Path (under `/api/auth`)  | Limit        |
| ------------------------- | ------------ |
| `/sign-in/email`          | 10 per 60 s  |
| `/sign-up/email`          | 5 per 60 s   |
| `/request-password-reset` | 5 per 300 s  |
| `/phone-number/send-otp`  | 5 per 300 s  |
| `/phone-number/verify`    | 10 per 300 s |

### `GET|POST /api/payments/callback/[provider]` — browser return from checkout

`src/app/api/payments/callback/[provider]/route.ts` → `payments.handleCallback`.

- **Auth:** none assumed — the provider's POST is cross-site, so there may be no session cookie. The
  request is authenticated only by its HMAC signature.
- **Request:** form fields (POST) or query parameters (GET). Razorpay sends `razorpay_order_id`,
  `razorpay_payment_id`, `razorpay_signature`; the sandbox sends `provider_order_id`,
  `provider_payment_id`, `signature`.
- **Processing:** verify the signature → find our payment by order id → re-fetch the payment from the
  provider (a signature proves authorisation, not capture) → if captured, call
  `bookings.recordCapturedPayment`, the only path to `CONFIRMED`.
- **Responses:**

| Case                                        | Response                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[provider]` is not the configured provider | `404 Not found`                                                                                                                                              |
| Processed                                   | `303` to `/account/rentals/<bookingId>?payment=<outcome>` where outcome is `confirmed`, `already_confirmed`, `late_capture_refunded`, `pending` or `invalid` |
| Signature invalid or order unknown          | `303` to `/account/rentals?payment=invalid`                                                                                                                  |
| Unexpected error (logged)                   | `303` to `/account/rentals?payment=error`                                                                                                                    |

The booking page reads the state from the database; the query flag only chooses a message.

### `POST /api/payments/webhook/[provider]` — provider webhooks

`src/app/api/payments/webhook/[provider]/route.ts` → `payments.handleWebhook`.

- **Auth:** HMAC-SHA256 of the **raw** body (`request.text()`, never re-serialised JSON) with the webhook
  secret, compared in constant time. Headers: `x-razorpay-signature` and `x-razorpay-event-id` for
  Razorpay; `x-sandbox-signature` and `x-sandbox-event-id` for the sandbox.
- **Inbox dedupe:** after verification the event is inserted into `provider_events` keyed by provider and
  event id. A redelivered event that was already `PROCESSED` or `IGNORED` is acknowledged without
  reprocessing; a previously `FAILED` one is processed again.
- **Events handled (Razorpay):** `payment.captured` and `order.paid` (capture → confirm), `payment.authorized`,
  `payment.failed` (never downgrades a captured payment), `refund.processed`, `refund.failed`. Anything
  else is stored and marked `IGNORED`.
- **Responses:**

| Case                                          | Status | Body                            |
| --------------------------------------------- | ------ | ------------------------------- |
| `[provider]` is not the configured provider   | 404    | `Not found`                     |
| Signature missing or wrong (nothing stored)   | 401    | `BAD_SIGNATURE`                 |
| Unparseable body or missing event id          | 400    | `MALFORMED`                     |
| Processed or ignored                          | 200    | `ok`                            |
| Already processed (duplicate delivery)        | 200    | `duplicate`                     |
| Processing failed (inbox row marked `FAILED`) | 500    | `failed` — the provider retries |

### `GET /api/files/[...key]` — stored photographs

`src/app/api/files/[...key]/route.ts` serves objects from the configured storage (filesystem or S3).

| Key prefix              | Visibility | Access check                                                                                 | `Cache-Control`                       |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| `outfits/`, `avatars/`  | Public     | None                                                                                         | `public, max-age=31536000, immutable` |
| `reports/`, `disputes/` | Private    | Signed-in admin, or the renter or owner of the booking the condition-report photo belongs to | `private, no-store`                   |

Keys must match `^[a-z]+/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$` and must not contain `..`. A bad key, a
missing object and a denied private object all return `404 Not found`, so the response never reveals
whether a private file exists. Successful responses also send `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'`.

Uploads do not go through a route handler: photographs are sent as multipart form data to
`uploadPhotoAction` and `conditionReportAction` (Server Action body limit 9 MB, `next.config.ts`).

### `POST /api/cron/sweep` — background work

`src/app/api/cron/sweep/route.ts`.

- **Auth:** `Authorization: Bearer <CRON_SECRET>`, compared in constant time. If `CRON_SECRET` is unset,
  every call is refused.
- **Effect:** one idempotent pass of `container().sweep()`: expire unanswered requests and unpaid approvals
  (reconciling with the provider first), auto-complete returned rentals whose inspection window has
  closed, open `NOT_RETURNED` disputes for rentals overdue by more than the policy's grace days, send
  pending refunds to the provider, deliver queued notification emails, and publish reviews whose window
  has closed.
- **Responses:** `401 Unauthorized`, or `200` with the report, for example:

```json
{
  "bookings": {
    "expiredApprovals": 0,
    "expiredPayments": 1,
    "autoCompleted": 0,
    "autoDisputed": 0,
    "errors": 0
  },
  "refunds": { "claimed": 0, "sent": 0 },
  "emails": { "claimed": 2, "sent": 2 },
  "reviewsPublished": 0
}
```

Locally, `pnpm jobs:sweep` (`scripts/sweep.ts`) calls this endpoint once on the running server.

### `GET /api/health`

Returns `200 {"status":"ok"}`. It does not touch the database; it only shows the process is serving
requests. Playwright uses it to wait for the e2e server.

## Contracts

Contracts are Zod 4 schemas, shared by the form (client-side feedback) and the use case (authoritative
parse). Most live in `src/modules/<name>/application/contracts.ts`; a few small ones are private to their
use case file. Money is entered in whole rupees (`…Rupees`) and converted to integer paise on the server.

| Schema                                                     | Location                            | Used by                                                            | Main rules                                                                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestBookingSchema`                                     | `bookings/application/contracts.ts` | `bookings.request`                                                 | `outfitId` UUID, `startDate` `YYYY-MM-DD`, `days` one of 2/3/5/7, `note` ≤ 500, `acceptTerms` must be true                                                                            |
| `bookingReasonSchema`                                      | `bookings/application/contracts.ts` | approve, reject, withdraw, cancel                                  | `bookingId` UUID, optional `reason` ≤ 500                                                                                                                                             |
| `adminCancelSchema`                                        | `bookings/application/contracts.ts` | admin `cancel`                                                     | `reason` 5–500, `retainedFeeRupees` integer ≥ 0                                                                                                                                       |
| `conditionReportSchema`                                    | `bookings/application/contracts.ts` | handover and return reports                                        | `grade` (`NEW_WITH_TAGS`/`EXCELLENT`/`GOOD`/`FAIR`), `notes` 5–2000, optional `returnedOn`                                                                                            |
| `acknowledgeSchema`                                        | `bookings/application/contracts.ts` | `acknowledgeHandover`                                              | optional `notes` ≤ 1000                                                                                                                                                               |
| `openDisputeSchema`                                        | `bookings/application/contracts.ts` | `openDispute`                                                      | `kind` from 8 dispute kinds, `description` 20–3000, optional `claimedRupees` ≥ 1                                                                                                      |
| `resolveDisputeSchema`                                     | `bookings/application/contracts.ts` | `resolveDispute`                                                   | `outcome` `COMPLETE`/`CANCEL`, withheld and retained rupees ≥ 0, `notes` 10–3000                                                                                                      |
| `disputeMessageSchema`                                     | `bookings/application/contracts.ts` | `addDisputeMessage`, accept / withdraw                             | `body` 2–2000                                                                                                                                                                         |
| `listingFormSchema`                                        | `listings/application/contracts.ts` | create and update listing                                          | title 5–120, description 30–3000, category, size, condition, retail value and deposit in rupees, occasions ≥ 1, locality, pickup address, prices for 2/3/5/7 days, measurements in cm |
| `moderationSchema`                                         | `listings/application/contracts.ts` | admin listing moderation                                           | `outfitId`, optional `note` ≤ 500 (required by the use case for reject/suspend)                                                                                                       |
| `outfitIdSchema`, `photoIdSchema`                          | `listings/application/contracts.ts` | status changes, photo removal                                      | UUIDs                                                                                                                                                                                 |
| `updateProfileSchema`                                      | `users/application/contracts.ts`    | `users.updateProfile`                                              | `displayName` 2–60, `bio` ≤ 500                                                                                                                                                       |
| `addressSchema`                                            | `users/application/contracts.ts`    | `users.addAddress`                                                 | `line1` 3–120, locality UUID, 6-digit PIN code                                                                                                                                        |
| `payoutAccountSchema`                                      | `users/application/contracts.ts`    | `users.savePayoutAccount`                                          | UPI ID such as `name@bank`, holder name 2–80                                                                                                                                          |
| `signUpSchema`, `signInSchema`, `phoneSchema`, `otpSchema` | `users/application/contracts.ts`    | auth forms (client side only; the server checks are Better Auth's) | password ≥ 10, 6-digit OTP                                                                                                                                                            |
| `exploreQuerySchema`                                       | `search/application/contracts.ts`   | `/explore` search parameters                                       | Lenient: malformed filters are dropped, never an error                                                                                                                                |
| `reviewSchema`                                             | `reviews/application/reviews.ts`    | `reviews.submit`                                                   | `rating` 1–5, optional comment                                                                                                                                                        |
| `blockSchema`                                              | `bookings/application/calendar.ts`  | `addOwnerBlock`                                                    | `from`/`to` dates, `note` ≤ 200                                                                                                                                                       |
| admin schemas                                              | `admin/application/admin.ts`        | suspend, reinstate, payouts, categories                            | reasons 5–500, payout reference 4–64, category slug `^[a-z0-9-]{2,40}$`                                                                                                               |

## Adding an endpoint

- A new UI mutation is a Server Action: parse with the module's contract inside the use case, call exactly
  one use case through `runAction`, return `ActionResult<T>` (or redirect with a flag), and revalidate the
  affected paths.
- A new route handler is justified only for the categories listed above. Webhooks must read the raw body
  and verify signatures before storing anything.
- Add a stable error code for every new expected failure and document it in
  [error-handling.md](error-handling.md).
