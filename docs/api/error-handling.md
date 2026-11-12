# Error handling

Expected failures are part of the contract: each has a stable `code` that the UI and tests can rely on,
and a `message` that is safe to show to a user. Everything else is an internal error, logged with a
reference and shown to the user without details.

See also: [API overview](api-overview.md), [database design](../architecture/database-design.md),
[ADR-003](../decisions/ADR-003-database-design.md), [ADR-004](../decisions/ADR-004-booking-concurrency.md).

## The DomainError hierarchy

`src/shared/domain/errors.ts` defines the base class and the generic errors. Modules add their own
subclasses or use `PreconditionError` with a specific code.

```
DomainError (abstract)                code            httpStatus
├── ValidationError                   VALIDATION_FAILED   422   + fieldErrors
├── NotFoundError                     NOT_FOUND           404
├── UnauthenticatedError              UNAUTHENTICATED     401
├── ForbiddenError                    FORBIDDEN           403
├── ConflictError                     CONFLICT            409
│   ├── ConcurrencyError              CONCURRENT_UPDATE   409
│   └── DataIntegrityError            DATA_INTEGRITY      409   (shared/infrastructure/pg-error.ts)
├── RateLimitedError                  RATE_LIMITED        429   + retryAfterSeconds
├── PreconditionError                 <given code>        422
│   ├── DatesUnavailableError         DATES_UNAVAILABLE         (bookings/application/core.ts)
│   └── InvalidTransitionError        INVALID_TRANSITION        (bookings/domain/booking-state-machine.ts)
├── InvalidImageError                 INVALID_IMAGE       422   (media/application/errors.ts)
└── ImageTooLargeError                IMAGE_TOO_LARGE     413   (media/application/errors.ts)
```

- `code` is stable and public. Never rename a code; add a new one.
- `message` is written for the user. It must not contain SQL, stack traces, provider responses, secrets or
  other users' data.
- `details` (optional) is for logs and tests only; it is **not** copied into `ActionResult`.
- `httpStatus` is a _suggested_ status for a route handler. Server Actions do not use it: they always
  return an `ActionResult` (or redirect), and no current route handler converts domain errors to HTTP
  statuses.
- `ConflictError` with code `CONFLICT` is a base class; nothing throws it directly today.

A few domain-level errors deliberately do **not** extend `DomainError`, because reaching them means a bug
or misconfiguration rather than a user mistake: `InvalidMoneyError` and `InvalidDateError` (shared domain),
`InvalidSettlementError` (deposits), `PaymentProviderError` (payments) and `InvalidEnvironmentError`
(config). If one reaches an action it becomes `INTERNAL_ERROR`.

## Error codes

Every code below appears in the code base. "Raised in" paths are relative to `src/`.

### Generic codes

| Code                | Meaning                                                                                                                             | Raised in                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED` | Input failed a Zod contract or a field-level rule; carries `fieldErrors`                                                            | `shared/contracts/validation.ts` (`parseInput`), and explicit `ValidationError`s in use cases (amounts, dates, photo counts, addresses)       |
| `NOT_FOUND`         | The thing does not exist **or the actor may not know it exists** (strangers to a booking get this, not `FORBIDDEN`)                 | Most use cases; `bookings/application/core.ts` (`loadBooking`, `requireRole`)                                                                 |
| `UNAUTHENTICATED`   | No valid session                                                                                                                    | `app/_lib/action.ts` (`runAction`), `shared/application/authorization.ts` (`requireUser`)                                                     |
| `FORBIDDEN`         | Signed in, related to the resource, but not allowed to do this                                                                      | `requireAdmin`, `bookings/application/core.ts` (`requireRole`), owner checks in listings and calendar                                         |
| `CONCURRENT_UPDATE` | A compare-and-swap lost a race, or a deadlock/serialisation failure persisted after retries                                         | `bookings/application/core.ts` (`applyTransition`), `listings/application/use-cases.ts` (status changes), `shared/infrastructure/pg-error.ts` |
| `DATA_INTEGRITY`    | A database constraint rejected the write and no specific mapping is registered                                                      | `shared/infrastructure/pg-error.ts` (`mapDatabaseError`)                                                                                      |
| `RATE_LIMITED`      | Too many attempts in the window (booking requests; uploads, listings, disputes, reviews and saved toggles via `app/_lib/limits.ts`) | `shared/infrastructure/rate-limiter.ts`                                                                                                       |
| `INVALID_IMAGE`     | Not a JPEG, PNG or WebP, or the image could not be decoded                                                                          | `modules/media/infrastructure/image-processor.ts`                                                                                             |
| `IMAGE_TOO_LARGE`   | Larger than 8 MB                                                                                                                    | `modules/media/infrastructure/image-processor.ts`                                                                                             |
| `INTERNAL_ERROR`    | Anything unexpected; message includes a reference                                                                                   | `shared/contracts/action-result.ts`, `app/_lib/action.ts` — never thrown, only returned                                                       |

### Account and verification

| Code                 | Meaning                                                 | Raised in                                                        |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `EMAIL_NOT_VERIFIED` | Renting and submitting a listing need a confirmed email | `shared/application/authorization.ts` (`requireVerifiedContact`) |
| `PHONE_NOT_VERIFIED` | …and a verified mobile number                           | `shared/application/authorization.ts` (`requireVerifiedContact`) |
| `ADDRESS_LIMIT`      | A user may keep at most 5 addresses                     | `modules/users/application/use-cases.ts`                         |

### Listings

| Code                     | Meaning                                                                  | Raised in                                   |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------- |
| `LISTING_STATE_CONFLICT` | The status change is not allowed from the current listing status         | `modules/listings/domain/outfit-status.ts`  |
| `LISTING_NEEDS_PHOTOS`   | Submitting without a photo, or removing the last photo of a live listing | `modules/listings/application/use-cases.ts` |
| `LISTING_HAS_BOOKINGS`   | Archiving while bookings are in progress                                 | `modules/listings/application/use-cases.ts` |
| `LISTING_FROZEN`         | Editing a suspended or archived listing                                  | `modules/listings/application/use-cases.ts` |
| `TOO_MANY_PHOTOS`        | More than 8 photographs                                                  | `modules/listings/application/use-cases.ts` |

### Booking requests and decisions

| Code                   | Meaning                                                                                                                  | Raised in                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `DATES_UNAVAILABLE`    | Another hold or an owner block covers the dates (advisory check at request; authoritative at approval and when blocking) | `modules/bookings/application/core.ts`, `request-booking.ts`, `calendar.ts`               |
| `START_TOO_SOON`       | Start date is less than 2 days ahead (IST)                                                                               | `modules/bookings/domain/booking-rules.ts`                                                |
| `START_TOO_FAR`        | Start date is more than 180 days ahead                                                                                   | `modules/bookings/domain/booking-rules.ts`                                                |
| `OWN_OUTFIT`           | Renting your own outfit                                                                                                  | `modules/bookings/application/request-booking.ts`; constraint `bookings_owner_not_renter` |
| `DURATION_NOT_OFFERED` | The owner has no price for that rental length                                                                            | `modules/bookings/application/request-booking.ts`                                         |
| `DUPLICATE_REQUEST`    | A pending request already exists for this renter, outfit and start date                                                  | constraint `bookings_one_pending_request` (`prisma-booking-store.ts`)                     |
| `OUTFIT_UNAVAILABLE`   | The outfit is no longer active or paused when the owner approves                                                         | `modules/bookings/application/decisions.ts`                                               |
| `REQUEST_EXPIRED`      | Approving a request past its approval deadline                                                                           | `modules/bookings/application/decisions.ts`                                               |
| `TOO_LATE_TO_APPROVE`  | Approval would leave the renter less than 60 minutes to pay                                                              | `modules/bookings/domain/booking-rules.ts`                                                |
| `INVALID_TRANSITION`   | The command is not allowed from this status for this role                                                                | `modules/bookings/domain/booking-state-machine.ts`                                        |

### Payment

| Code                    | Meaning                                                                                                                          | Raised in                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `NOT_PAYABLE`           | The booking is not awaiting payment, or its payment cannot be retried                                                            | `modules/payments/application/payments.ts`             |
| `PAYMENT_WINDOW_CLOSED` | Less than 2 minutes remain before the payment deadline                                                                           | `modules/payments/application/payments.ts`             |
| `AMOUNT_MISMATCH`       | Captured amount or currency differs from the booking (callback/webhook path)                                                     | `modules/bookings/application/payment-events.ts`       |
| `DUPLICATE_CAPTURE`     | A different provider payment was already captured for this booking                                                               | `modules/bookings/application/payment-events.ts`       |
| `NOT_PAID`              | Settling a booking without a captured payment                                                                                    | `modules/bookings/application/core.ts` (`settleMoney`) |
| `HANDOVER_UNDER_WAY`    | Renter or owner cancelling a paid booking once the handover report exists or the start date has arrived (open a dispute instead) | `modules/bookings/application/decisions.ts`            |

`AMOUNT_MISMATCH` and `DUPLICATE_CAPTURE` arise inside the provider routes, not in user actions. Neither is
retried: the webhook writes a `payment.unexpectedCapture` audit entry, marks the inbox row `IGNORED` and
answers `200 flagged`; the callback writes the same audit entry and redirects with `?payment=error`. An
administrator refunds such payments by hand.

### Rental, return and disputes

| Code                  | Meaning                                                                                                                                | Raised in                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `NOT_CONFIRMED`       | Handover report on a booking that is not (or no longer) `CONFIRMED`                                                                    | `modules/bookings/application/rental.ts`   |
| `TOO_EARLY`           | Handover before the day before the start date; handover dispute before the start date                                                  | `rental.ts`, `disputes.ts`                 |
| `REPORT_LOCKED`       | The renter has already acknowledged the handover report                                                                                | `modules/bookings/application/rental.ts`   |
| `NO_HANDOVER_REPORT`  | Acknowledging before the owner recorded the handover with enough photos                                                                | `modules/bookings/application/rental.ts`   |
| `NOT_ACTIVE`          | Recording a return for a booking that is not `ACTIVE`                                                                                  | `modules/bookings/application/rental.ts`   |
| `DISPUTE_OPEN`        | Confirming a return, or opening a second dispute, while one is open                                                                    | `rental.ts`, `disputes.ts`                 |
| `DISPUTE_NOT_ALLOWED` | That dispute kind cannot be opened by this role in this state                                                                          | `modules/bookings/application/disputes.ts` |
| `NOT_OVERDUE`         | `NOT_RETURNED` dispute before the end date has passed                                                                                  | `modules/bookings/application/disputes.ts` |
| `WINDOW_CLOSED`       | Post-return dispute after the inspection window                                                                                        | `modules/bookings/application/disputes.ts` |
| `NOT_RESPONDENT`      | Only the other party can accept a claim                                                                                                | `modules/bookings/application/disputes.ts` |
| `NOT_OPENER`          | Only the opener can withdraw a dispute                                                                                                 | `modules/bookings/application/disputes.ts` |
| `NEEDS_ADMIN`         | The dispute cannot be settled by the parties (opened by an admin or the system, or not a post-return claim) and needs an administrator | `modules/bookings/application/disputes.ts` |

### Reviews and administration

| Code                   | Meaning                                            | Raised in                                |
| ---------------------- | -------------------------------------------------- | ---------------------------------------- |
| `NOT_COMPLETED`        | Reviewing a rental that is not complete            | `modules/reviews/application/reviews.ts` |
| `REVIEW_WINDOW_CLOSED` | More than 14 days after completion                 | `modules/reviews/application/reviews.ts` |
| `ALREADY_REVIEWED`     | One review per person per rental                   | `modules/reviews/application/reviews.ts` |
| `SELF_SUSPEND`         | An administrator suspending their own account      | `modules/admin/application/admin.ts`     |
| `ADMIN_TARGET`         | Suspending another administrator                   | `modules/admin/application/admin.ts`     |
| `PAYOUT_NOT_PENDING`   | Marking a payout paid when it is no longer pending | `modules/admin/application/admin.ts`     |

## From error to ActionResult

`runAction` (`src/app/_lib/action.ts`) wraps every Server Action body:

```ts
try {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  return { ok: true, data: await body(actor) };
} catch (error) {
  const expected = toActionError(error); // DomainError → { code, message, fieldErrors? }
  if (expected) return { ok: false, error: expected };
  const reference = randomUUID().slice(0, 8);
  logger.error(`action ${name} failed`, error, { reference });
  return { ok: false, error: { ...INTERNAL_ERROR, message: `${INTERNAL_ERROR.message} (ref ${reference})` } };
}
```

- **Expected errors** keep their `code` and `message`. Only `ValidationError` adds `fieldErrors`.
- **Unknown errors** become `INTERNAL_ERROR` with the message
  `Something went wrong on our side. Please try again. (ref 1a2b3c4d)`. The full error (name, message,
  stack) and the reference are written as one JSON line to stderr by `shared/infrastructure/logger.ts`, so
  a user's reference can be matched to the log entry.
- Form-post actions put `error.message` into the redirect URL (`?error=…`). Because only user-safe
  messages and the generic internal message ever reach `ActionError`, nothing sensitive ends up in a URL.

### Field errors

`parseInput` maps each Zod issue to its path joined with `.`; issues without a path go under `_form`:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Please check the highlighted fields.",
    "fieldErrors": { "depositRupees": ["Enter a deposit."], "occasions": ["Choose at least one occasion."] }
  }
}
```

Use cases also throw `ValidationError` with hand-built field errors for rules that need data (for example
`pickupAddressId` not belonging to the owner, `claimedRupees` above the deposit, `photos` below the
minimum). The listing and account forms map `fieldErrors` back onto their fields; the booking forms show
the first message.

## Postgres errors

Database constraints are the last line of defence. `src/shared/infrastructure/pg-error.ts` turns their
failures into domain errors.

### Extracting SQLSTATE and the constraint name

Errors arrive wrapped differently depending on the path (Prisma query engine, raw query, `pg` driver
adapter). `extractPgError` walks `cause`, `meta`, `driverAdapterError`, `originalError` and `kind` to find a
five-character SQLSTATE, ignoring Prisma's own `P…` codes. As a last resort it reads `code`/`SQLSTATE`
from the message text.

**Prisma 7's pg adapter keeps the SQLSTATE but drops the driver's `constraint` field**, so the constraint
name is read from the message:

- declarative constraints: `… violates check constraint "bookings_money_valid"` → `bookings_money_valid`;
- trigger-raised errors: our triggers prefix their message with the constraint name, for example
  `bookings_legal_transition: illegal booking transition CONFIRMED -> PENDING_APPROVAL` (migration
  `20261111190646_trigger_error_names`). The same applies to `bookings_initial_status`,
  `bookings_snapshot_immutable` and `<table>_append_only`.

### Mapping

| SQLSTATE | Meaning                             | Result of `mapDatabaseError`                                       |
| -------- | ----------------------------------- | ------------------------------------------------------------------ |
| `40001`  | Serialisation failure               | Retried by the unit of work; after 3 attempts → `ConcurrencyError` |
| `40P01`  | Deadlock detected                   | Same as above                                                      |
| `23505`  | Unique violation                    | Registered mapper for the constraint, else `DataIntegrityError`    |
| `23514`  | Check violation (also our triggers) | Registered mapper, else `DataIntegrityError`                       |
| `23503`  | Foreign-key violation               | Registered mapper, else `DataIntegrityError`                       |
| `23P01`  | Exclusion violation                 | Registered mapper, else `DataIntegrityError`                       |
| other    | —                                   | Returned unchanged (becomes `INTERNAL_ERROR` in an action)         |

`DomainError`s pass through untouched. Mapping happens in `prismaUnitOfWork`
(`src/shared/infrastructure/unit-of-work.ts`): it runs the transaction at READ COMMITTED, retries
`40001`/`40P01` up to three attempts in total, then throws `mapDatabaseError(error)`. Today only the bookings
write path runs through the unit of work (including payment confirmation, which goes through
`bookings.recordCapturedPayment`). The other repositories (listings, users, reviews, admin, the payments
repository) do not call `mapDatabaseError`, so a constraint failure there is reported as `INTERNAL_ERROR`.

The calendar-hold inserts use `ON CONFLICT ON CONSTRAINT calendar_holds_no_overlap DO NOTHING`, so an
overlap normally returns no row and the use case throws `DatesUnavailableError` directly rather than
handling `23P01` (see [ADR-004](../decisions/ADR-004-booking-concurrency.md)).

### Registering a constraint mapping

When users can trip a database guard in normal use, give it a clear error by registering the constraint
name from the module's infrastructure:

```ts
// src/modules/bookings/infrastructure/prisma-booking-store.ts
registerConstraintError(
  "bookings_one_pending_request",
  () =>
    new PreconditionError(
      "DUPLICATE_REQUEST",
      "You already have a request waiting for this outfit on that start date.",
    ),
);
registerConstraintError(
  "bookings_owner_not_renter",
  () => new PreconditionError("OWN_OUTFIT", "You cannot rent your own outfit."),
);
```

Rules:

- Name every constraint explicitly in the migration; the name is the key.
- For a trigger, start the `RAISE EXCEPTION` message with `<constraint_name>: ` and set
  `CONSTRAINT = '<constraint_name>'` as well.
- Only map guards a user can reach. A constraint that should be unreachable stays a `DATA_INTEGRITY`
  conflict: if users see it, it is a bug in the application checks.

## Route handlers

Route handlers do not use `ActionResult`:

| Route                               | Failure behaviour                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/api/payments/webhook/[provider]`  | `401 BAD_SIGNATURE`, `400 MALFORMED`, `500 failed` (logged, inbox row `FAILED` with the error message, provider retries) |
| `/api/payments/callback/[provider]` | Never shows an error page: `303` redirect with `?payment=invalid` or `?payment=error` (logged)                           |
| `/api/files/[...key]`               | `404 Not found` for every failure, including denied access                                                               |
| `/api/cron/sweep`                   | `401 Unauthorized`; individual booking failures are counted in `bookings.errors` and do not stop the sweep               |

## Rules

- Throw a `DomainError` subclass (or `PreconditionError` with a new `SCREAMING_SNAKE_CASE` code) for every
  expected failure, and add the code to this document.
- Never leak internals: no stack traces, SQL, constraint names, provider payloads or secrets in messages
  shown to users. Put diagnostic data in `details` or in the log.
- Never log secrets, tokens, OTPs or full payment payloads (`logger.ts`).
- Do not swallow errors. Log unexpected ones once, at the boundary, with the reference.
- Strangers get `NOT_FOUND`; `FORBIDDEN` is for people who are related to the resource but lack the right.
