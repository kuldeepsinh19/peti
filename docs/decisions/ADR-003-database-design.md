# ADR-003: Database design — PostgreSQL integrity first

- Status: Accepted
- Date: 2026-11-11

## Context

Bookings and money are the business. Bugs in application code, or a future script, admin console or second
service, must not be able to create double bookings, self-rentals, illegal status jumps, money that does not
add up, or edited history. Prisma's schema language cannot express EXCLUDE or CHECK constraints, partial or
expression indexes, or triggers.

## Decision

1. **PostgreSQL is the last line of defence.** Every invariant that can be expressed declaratively is a
   named database constraint, in addition to domain validation:
   - `EXCLUDE USING gist` on `calendar_holds` (no overlapping holds per outfit) — see ADR-004.
   - CHECKs: owner ≠ renter; date/duration identity; money identities (`renter_total = fee + deposit`,
     `owner_payout = fee − commission`, payout net identity); non-negative bounded amounts;
     refunded ≤ captured; deposit status ↔ withheld amount; closed reason ↔ closed status.
   - Composite foreign keys, so a booking's owner is the outfit's owner and a hold's outfit is its
     booking's outfit.
   - Partial unique indexes: one open dispute per booking, one pending request per renter/outfit/start,
     one refund per payment and reason, one default address per user.
   - A trigger backed by `booking_allowed_transitions` rejects any status change not in the transition
     table; a test asserts the SQL table equals the TypeScript table.
   - Append-only triggers on `booking_status_history` and `audit_logs`.
2. **Money is integer paise** (`integer`, up to about ₹2.1 crore per value — ample for garments). Never
   floats, never JS `bigint` (it breaks JSON and Server Component serialisation). Rates are basis points.
3. **Calendar days are `date`**, mapped to a `LocalDate` string value object; "today" is computed in
   Asia/Kolkata. Instants are `timestamptz(3)`.
4. **Raw SQL lives in hand-edited migrations** created with `prisma migrate dev --create-only`. Every
   constraint has an explicit name that `pg-error.ts` maps to a domain error.
5. **Search** uses an IMMUTABLE `outfit_search_document()` function with a GIN expression index (the
   `'simple'` text-search config, so garment names and transliterated Hindi/Gujarati are not stemmed as
   English) plus a `pg_trgm` index on titles for misspellings ("lehnga").
6. **The rental agreement** is not a separate table in the MVP: the booking stores `terms_version`, a frozen
   `policy_snapshot` and both acceptance timestamps.

## Consequences

- Some business rules exist twice (domain and constraint). That is deliberate; tests cover both.
- Prisma Migrate must not drop hand-written objects. CI runs a drift check (`pnpm db:drift`) that fails if
  the migrations and the schema disagree.
- Raw SQL is limited to migrations, the hold insert, row locks, worker picks and the discovery query — each
  behind an infrastructure function with an integration test.

## Verification notes (2026-11-12)

- **No drift from hand-written SQL.** After applying the integrity migration,
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` produces an empty
  migration: Prisma 7 does not try to drop the EXCLUDE/CHECK constraints, partial and expression indexes,
  triggers or the view. CI runs this as `pnpm db:drift` with `--exit-code`.
- **Constraint names in errors.** With `@prisma/adapter-pg`, Prisma surfaces the SQLSTATE and the
  Postgres message but not the driver's `constraint` field. `pg-error.ts` therefore reads the name from
  the message (`violates … constraint "name"`), and trigger-raised errors prefix their message with the
  constraint name (migration `trigger_error_names`). Both shapes are pinned by unit and integration tests.
- **Guards proven.** `tests/integration/database/guards.test.ts` bypasses the application and shows that
  self-rental, mismatched owners, non-initial insert status, illegal transitions, snapshot edits, duplicate
  pending requests, edits to history/audit rows, overlapping holds, over-refunds and inconsistent deposit
  states are all rejected by the database. The constraint also caught a genuine modelling gap during
  seeding (a 5.5 m saree length), fixed in migration `saree_length_measurement`.
- **Destructive commands.** Prisma refuses `migrate reset` when run by an AI agent. The test database is
  therefore prepared with the non-destructive `migrate deploy`, and tests truncate tables between cases.
