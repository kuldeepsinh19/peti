# Stack verification (2026-11-11)

Versions were checked against the npm registry, official documentation and GitHub releases on 2026-11-11
before scaffolding. Exact installed versions are in `package.json` / `pnpm-lock.yaml`; this file records
*why* those versions, and the traps found on the way. Items we could not confirm are marked UNVERIFIED.

## Runtime

- **Node 20 reached end of life on 2026-03-24** ([Node.js releases](https://nodejs.org/en/about/previous-releases)).
  Several current majors no longer install on it (Vitest 5, jsdom 30+, Testcontainers 12.1+,
  `@testing-library/jest-dom` 7, pnpm 11, Prisma 8, the Better Auth CLI). Peti targets **Node 24 LTS**.
- **pnpm 10** (`packageManager` field). pnpm 11 needs Node ≥ 22.13; pnpm 10 is the documented Windows path.

## Framework: Next.js 16

- Turbopack is the default for `next dev` and `next build`.
- `middleware.ts` is now **`proxy.ts`** with an exported `proxy` function, running on Node.js. It is used only
  for a cheap session-cookie redirect; every page and action re-checks the session.
- `next lint` is removed and `next build` no longer lints: ESLint runs from its own CLI with a flat config.
- Request APIs are async only (`params`, `searchParams`, `cookies()`, `headers()`).
- `use cache` requires opting in with `cacheComponents: true`; Peti leaves it off.
- Vitest cannot render async Server Components; those are covered by Playwright.

## Language: TypeScript 6, not 7

TypeScript 7 (the Go compiler) has no JS API yet; typescript-eslint supports `<6.1` and Next's in-process
type checker cannot load TS 7. Peti pins TS 6.0 and avoids `baseUrl` / `moduleResolution: node`, which are
deprecated in 6 and errors in 7.

## ORM: Prisma 7, pinned exactly

- `npm i prisma` currently resolves to an **8.0 release candidate** while `@prisma/client@latest` is 7.x.
  Prisma 8 is still changing between RCs and Better Auth's Prisma adapter does not support it yet. Peti
  pins `prisma`, `@prisma/client` and `@prisma/adapter-pg` to the same 7.x version.
- Prisma 7 rules that shape the code: ESM only; `prisma-client` generator with an explicit `output`; a driver
  adapter is mandatory (`@prisma/adapter-pg`); connection URL, seed and migrations path live in
  `prisma.config.ts`; `.env` is not loaded automatically; `migrate dev` no longer runs `generate` or seed.
- CHECK and EXCLUDE constraints, partial indexes and triggers are not expressible in the schema. They live in
  hand-edited SQL migrations (`prisma migrate dev --create-only`). Whether Prisma reports them as drift is
  checked in CI (see [ADR-003](../decisions/ADR-003-database-design.md)).
- Interactive transactions accept an isolation level on Postgres. Peti does not need Serializable (see
  [ADR-004](../decisions/ADR-004-booking-concurrency.md)).
- **Drizzle** was considered: its stable line is 0.45.x with 1.0 in release candidates since 2025, and its
  constraint docs do not cover EXCLUDE, so hand-written SQL would be needed either way.

## Authentication: Better Auth

Auth.js v5 never left beta and is maintained for security fixes only; its maintainers recommend Better Auth
for new projects. Better Auth provides email/password, database sessions, email verification, password
reset, a phone-number (OTP) plugin, an admin plugin (roles, bans) and rate limiting.

Gotchas: rate limiting is on by default only in production and is in-memory unless `storage: "database"`;
`X-Forwarded-For` must only be trusted behind a configured proxy; the `nextCookies()` plugin must come last
for cookies to be set from Server Actions.

## UI primitives

- **Base UI 1.x** — stable since December 2025, unstyled and accessible. Chosen so the design system carries
  no borrowed visual defaults.
- **`@daypicker/react`** (react-day-picker 10 renamed) for range calendars; CSS import moved to
  `@daypicker/react/style.css`.

## Testing

Vitest 5 (`clearMocks` on by default; un-awaited `resolves`/`rejects` fail), Testing Library, jsdom,
Playwright. Integration tests use the real Compose Postgres rather than Testcontainers to keep memory use low
on development machines; CI uses a Postgres service container.

## Payments: Razorpay (design target, test mode only)

- Amounts are in paise. After checkout, verify HMAC-SHA256 of `order_id + "|" + payment_id` with the key
  secret, using the order id **stored on our server**.
- Webhooks: verify `X-Razorpay-Signature` as HMAC-SHA256 of the **raw** body with the separate webhook
  secret; deduplicate on `x-razorpay-event-id`.
- Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`,
  `refund.failed`. `payment.failed` can be followed by `payment.captured` (UPI retries), so event order is not
  assumed.
- **Route** is Razorpay's marketplace split-payment product (linked accounts, transfers). It has eligibility
  requirements; Peti's MVP records owner payouts and has an admin mark them paid instead.
- UNVERIFIED: transfer `on_hold` fields and transfer webhook names; the SDK's minimum Node version.

## Object storage

- **MinIO is not an option**: the repository was archived on 2026-04-25 and prebuilt images are no longer
  published. LocalStack's image now needs an auth token.
- Peti defaults to a local-filesystem adapter in development and ships an S3 adapter
  (`@aws-sdk/client-s3`, `forcePathStyle`) that works with any S3-compatible service; the Compose file
  includes **RustFS** (Apache-2.0) under an opt-in profile for exercising it locally.

## PostgreSQL

- **PostgreSQL 18** (`postgres:18`). PG 18 images mount the volume at `/var/lib/postgresql` (PGDATA is now
  versioned underneath it).
- `btree_gist` is a trusted contrib extension in the official image. PG 18's `WITHOUT OVERLAPS` cannot take a
  `WHERE` clause, so an `EXCLUDE` constraint is still the right tool.

## Still unverified at the time of writing

- Exact behaviour of `@prisma/adapter-pg` under concurrent exclusion-constraint conflicts (proved by
  integration tests instead).
- Whether `prisma migrate dev` leaves hand-written EXCLUDE constraints alone (checked in CI).
- Razorpay Route transfer details.
