# ADR-004: Preventing double bookings under concurrency

- Status: Accepted
- Date: 2026-11-11

## Context

An outfit can be requested by several renters for overlapping dates, and owners can block dates on their
calendar. Two approvals, or an approval and a block, may race. Every rental also needs a turnaround buffer
for cleaning. The brief requires prevention at the database level and safety under concurrent requests.

## Decision

1. **Single `calendar_holds` table** with `kind = BOOKING | OWNER_BLOCK`, a half-open date range
   (`starts_on` inclusive, `ends_before` exclusive) and one constraint:

   ```sql
   ALTER TABLE calendar_holds ADD CONSTRAINT calendar_holds_no_overlap
     EXCLUDE USING gist (outfit_id WITH =, (daterange(starts_on, ends_before, '[)')) WITH &&);
   ```

   Booking-vs-booking and booking-vs-block conflicts are both enforced by the database. The range is built
   from two plain `date` columns, so Prisma never sees a `daterange` type.

2. **Holds are taken at approval, not at payment.** A pending request holds nothing (owners can see
   competing requests). Approval moves the booking to `AWAITING_PAYMENT` and inserts the hold
   `[start, end + 1 + buffer_days)`, so two approved renters can never both pay. Expiry or cancellation
   deletes the hold.
3. **The insert does not abort the transaction on conflict:**

   ```sql
   INSERT INTO calendar_holds (...) VALUES (...)
   ON CONFLICT ON CONSTRAINT calendar_holds_no_overlap DO NOTHING
   RETURNING id;
   ```

   Zero rows returned means `DatesUnavailableError`, and the use case rolls back cleanly.

4. **Hold-acquiring commands lock the outfit row** with `SELECT … FOR NO KEY UPDATE` first. This serialises
   competing approvals for one outfit (avoiding deadlocks between concurrent exclusion checks) and makes the
   "outfit is still ACTIVE" check reliable. `FOR NO KEY UPDATE` rather than `FOR UPDATE`, so new booking
   requests (which take `FOR KEY SHARE` through their foreign key) are not blocked.
5. **READ COMMITTED isolation.** The exclusion constraint is sufficient for correctness; Serializable would
   add retry handling across the app for no gain. `40P01`/`40001` are still mapped to a bounded retry and
   then a `ConcurrencyError`.
6. **Consistency invariant:** a booking has a hold if and only if its status is one of `AWAITING_PAYMENT`,
   `CONFIRMED`, `ACTIVE`, `RETURNED`, `DISPUTED`, `COMPLETED`. Holds are written only inside the booking
   transition's transaction; an integration test runs the invariant query after the concurrency tests.
7. **Late returns never extend a hold**, which could violate the constraint against the next booking; the
   buffer absorbs small delays and an overdue rental is flagged to the owner and admin.

## Verification

- Deterministic two-connection test: connection A inserts a hold and keeps its transaction open;
  connection B's overlapping insert blocks, then fails with `23P01` when A commits (and succeeds when A
  rolls back).
- Stress test: ten overlapping pending bookings approved concurrently → exactly one succeeds, nine fail
  with `DatesUnavailableError`, one hold exists, the invariant query is empty.
- Block-vs-approve race: exactly one wins.
- Boundary tests for buffers and adjacency (`[10,14)` and `[14,17)` do not overlap).
- Mutation check: with the constraint dropped, the stress test fails.

## Alternatives considered

- **Partial EXCLUDE on `bookings` filtered by status, plus a separate blocks table.** Leaves
  booking-vs-block races unprotected, because a constraint cannot span two tables.
- **Application-level check then insert.** Racy by construction.
- **Serializable transactions everywhere.** Correct but noisy (40001 retries), and it still needs a
  definition of conflict.
- **Hold at payment.** Lets two approved renters both pay, forcing refunds.
