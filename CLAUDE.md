# CLAUDE.md — working on Peti

Instructions for anyone (human or agent) changing this repository. Keep it accurate: if you change a
rule, change it here in the same commit.

## 1. Product in one paragraph

Peti is a **peer-to-peer** rental marketplace for premium occasionwear (sherwanis, Jodhpuri suits,
lehengas, designer sarees), launching in Ahmedabad. Individuals list garments **they own**, set their own
prices per duration, and approve or reject requests. Renters pay a rental fee plus a refundable security
deposit on-platform; a booking is confirmed **only** after the payment provider confirms the payment.
Handover and return happen in person and are each recorded with a condition report. The platform earns a
commission on **completed** rentals. Peti never owns, stores or ships inventory.

Product docs: [docs/product](docs/product). Lifecycle and money rules:
[booking-lifecycle.md](docs/architecture/booking-lifecycle.md),
[payment-architecture.md](docs/architecture/payment-architecture.md).

Non-negotiables:

- No company-owned inventory, no e-commerce "buy" flows.
- Never claim a user is identity-verified. Identity verification is a port with no real adapter; status
  stays `UNVERIFIED`. Never collect Aadhaar numbers or ID documents.
- Never mark a payment as succeeded without a signature-verified, provider-confirmed capture.
- Never invent business data (metrics, testimonials, user counts) in UI copy, seed data or docs.

## 2. Stack

Node 24 LTS · pnpm 10 · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 strict ·
Tailwind CSS 4 · Base UI · React Hook Form + Zod 4 · PostgreSQL 18 · Prisma 7 (`@prisma/adapter-pg`) ·
Better Auth · Vitest 5 · Testing Library · Playwright · ESLint 10 · Prettier · dependency-cruiser.

Why each was chosen: [ADR-001](docs/decisions/ADR-001-technology-stack.md),
[stack-verification.md](docs/research/stack-verification.md). **Prisma packages are pinned to an exact 7.x
version** — `pnpm add prisma` would pull an 8.0 release candidate.

## 3. Repository map

```
src/app/            routes only: pages, layouts, thin server actions, route handlers
src/modules/<name>/ feature modules (see §4)
src/shared/         shared kernel: domain (Paise, LocalDate…), application (actor, ports),
                    infrastructure (prisma, pg errors, rate limiter), ui (design system), contracts
src/composition/    composition root — the only place adapters are bound to ports
src/config/         env.ts (validated env), marketplace-policy.ts (business defaults), site.ts
src/generated/      Prisma client (generated, git-ignored — never edit)
prisma/             schema.prisma, migrations/, seed.ts, seed-assets/
tests/              unit/ · component/ · integration/ · e2e/ · support/
scripts/            one-off and operational scripts (tsx)
docs/               product/ architecture/ decisions/ api/ development/ research/ security/
```

## 4. Architecture rules (enforced by `pnpm boundaries`)

Modular monolith, see [ADR-002](docs/decisions/ADR-002-modular-monolith.md). Each module has:

| Layer             | May import                                                                                            | Must not import                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `domain/`         | own domain, `shared/domain`                                                                           | anything else: no Next, React, Prisma, pg, env, I/O |
| `application/`    | own domain + application, `shared/domain`, `shared/application`, other modules' `index.ts`, `config/` | infrastructure, ui, Prisma, Next                    |
| `infrastructure/` | anything in its module, `shared/*`, Prisma client                                                     | ui, `app/`                                          |
| `ui/`             | domain types, application contracts, `shared/ui`                                                      | infrastructure, composition, Prisma                 |
| `index.ts`        | the module's public API                                                                               | —                                                   |

- Another module's internals are private: import `@/modules/<other>` (its `index.ts`) only.
- `src/app/**` never imports Prisma or a module's infrastructure. Pages and actions get use cases from
  `@/composition/container`.
- Business rules live in `domain/` (pure functions, state machines, policies) and `application/`
  (use cases). **No business rules in React components or route handlers.**
- One use case per file, named for the intent: `approve-booking.ts` exporting `approveBooking`.
  Prefer functions taking a `deps` object over classes. No god services.
- Add an abstraction only when there are two implementations or a real test seam (ports for payment,
  storage, mail, SMS, identity, clock). Repositories are ports where a use case needs a seam; simple
  read queries can live in the module's `infrastructure/queries.ts` exposed through a query port.
- No circular dependencies, ever.

Modules: `auth`, `users`, `listings`, `categories`, `search`, `availability`, `bookings`, `payments`,
`deposits`, `reviews`, `notifications`, `disputes`, `admin`, `media`.

## 5. Naming conventions

- Files and folders: `kebab-case.ts`; React components `PascalCase` exports in `kebab-case.tsx` files.
- Types and classes `PascalCase`; functions and variables `camelCase`; constants `SCREAMING_SNAKE_CASE`
  only for true constants.
- Domain errors end in `Error` and carry a stable `code` (`DATES_UNAVAILABLE`).
- Money variables end in `Paise` (`rentalFeePaise`); dates that are calendar days are `LocalDate`
  (`"2026-12-01"`), instants are `Date`.
- Database: tables and columns `snake_case` via `@@map` / `@map`; Prisma models `PascalCase` singular.
- Tests: `<subject>.test.ts(x)`; e2e specs `<journey>.spec.ts`.

## 6. Database conventions

See [database-design.md](docs/architecture/database-design.md) and
[ADR-003](docs/decisions/ADR-003-database-design.md).

- Money is **integer paise** (`Int`), never floats or `Decimal` arithmetic in JS. Use `Paise` helpers in
  `shared/domain/money.ts`. Percentages are basis points (`1500` = 15%), rounding half-up in one place.
- Rental days are `@db.Date` mapped to `LocalDate`. "Today" is always computed in `Asia/Kolkata` via the
  `Clock` port. Instants are `@db.Timestamptz(3)`.
- Anything Prisma cannot express (EXCLUDE, CHECK, partial/expression indexes, triggers, views) goes in a
  hand-edited migration created with `pnpm prisma migrate dev --create-only`. Name constraints explicitly —
  the code maps constraint names to domain errors.
- Never edit an applied migration. Add a new one.
- Booking status changes only through `applyTransition` (a DB trigger rejects illegal transitions).
  Calendar holds are written only by the availability module inside the same transaction.
- Lock order in every transaction: outfit → booking → payment → deposit.
- History and audit tables are append-only (triggers reject UPDATE/DELETE).

## 7. API conventions

See [api-overview.md](docs/api/api-overview.md) and [error-handling.md](docs/api/error-handling.md).

- Mutations from the UI are **Server Actions** in `src/app/**/actions.ts`; they are thin: parse input with
  the module's Zod contract, resolve the actor, rate-limit if needed, call one use case, return
  `ActionResult<T>`, revalidate paths.
- Route handlers (`route.ts`) only for: auth, payment callback/webhook, uploads, file serving, cron sweep,
  health. Webhooks read the **raw** body for signature checks.
- Contracts (Zod schemas + inferred types) live in `modules/<name>/application/contracts.ts` and are shared
  by forms and actions.

## 8. Validation

- Validate **all** external input at the boundary with Zod: form data, search params, route params, webhook
  bodies, env, uploaded files (magic bytes + size, re-encoded with sharp).
- Never trust client-computed values: prices, totals, availability and ownership are recomputed server-side.
- Domain invariants are also enforced by database constraints; validation is not a substitute.

## 9. Error handling

- Domain/application code throws `DomainError` subclasses with stable codes; infrastructure maps Postgres
  errors (`23P01`, `23514`, `40P01`, `40001`) to domain errors in `shared/infrastructure/pg-error.ts`.
- Actions convert errors with `toActionResult`; unknown errors are logged with a request id and returned as
  `INTERNAL_ERROR` without internals. Never leak stack traces, SQL or provider responses to users.
- Do not swallow errors. Do not use exceptions for control flow inside the domain where a result type is
  clearer.

## 10. Authentication and authorisation

- Better Auth with database sessions. Roles on the user are only `USER` and `ADMIN`; "owner" and "renter"
  are per-booking relationships, not roles.
- **Every** use case authorises its actor server-side (owner of the outfit, participant in the booking,
  admin). `src/proxy.ts` only redirects anonymous visitors cheaply; it is never the security boundary.
  Hiding a button is never authorisation.
- Suspended users cannot sign in, list or book. Admin actions require a reason and write an audit log.
- Contact details (phone, pickup address) are revealed to the counterparty only from `CONFIRMED`.

## 11. Security expectations

See [security-architecture.md](docs/architecture/security-architecture.md) and [SECURITY.md](SECURITY.md).

- Secrets only from env; never commit `.env`; never log secrets, tokens, OTPs or full payment payloads.
- The sandbox payment provider, dev outbox and `/dev/*` pages exist only when `APP_ENV` is `local` or
  `test`; `env.ts` refuses to boot production with them.
- Rate-limit auth, booking requests, uploads and dispute creation.
- Strip EXIF (including GPS) from every uploaded photo. Serve user files through the app with
  authorisation where they are private (condition-report photos).
- Privacy by design: collect the minimum; listings show locality, never the street address.

## 12. Testing requirements

See [testing-guide.md](docs/development/testing-guide.md).

- **Unit** (`tests/unit`): every domain rule — state machine (exhaustive), pricing, settlement,
  cancellation tiers, date maths in IST.
- **Integration** (`tests/integration`, real Postgres `peti_test`): every use case that writes, all
  database guards, concurrency (exclusion constraint, concurrent approvals, callback vs webhook).
  Do not wrap tests in a rollback-per-test transaction — concurrency tests need real commits; truncate
  between tests instead.
- **Component** (`tests/component`): interactive client components with business-visible behaviour.
- **E2E** (`tests/e2e`): the core journeys and authorisation denials.
- A bug fix starts with a failing test. Critical tests must be shown to fail when the guard is removed.

## 13. Coding standards

- TypeScript strict with `noUncheckedIndexedAccess`; no `any` (use `unknown` and narrow); no non-null
  assertions on external data.
- Server-only modules import `server-only`. Client components are leaves; keep `"use client"` low.
- Prefer small pure functions, early returns, explicit types at module boundaries.
- Comments explain _why_, not _what_. No commented-out code. No TODOs for core behaviour.
- UI: follow [design-direction.md](docs/product/design-direction.md) — tokens from `globals.css`, no ad-hoc
  hex values, no gradients, no shadows, square corners, accessible names on every control, visible focus.

## 14. Git workflow

- `main` is always releasable. Work in small, logical commits; each commit builds and passes tests.
- Conventional Commits: `feat(bookings): …`, `fix(payments): …`, `docs: …`, `test: …`, `chore: …`,
  `ci: …`, `refactor: …`, `build: …`, `style: …`.
- Pull requests must pass CI (lint, format, typecheck, boundaries, unit, integration, build, e2e).

## 15. Environment configuration

All variables are documented in [.env.example](.env.example) and validated in `src/config/env.ts`.
`APP_ENV` (`local | test | staging | production`) — not `NODE_ENV` — decides whether dev tooling runs.
Business defaults (commission, windows, buffers, tiers) live in `src/config/marketplace-policy.ts` and are
snapshotted onto each booking.

## 16. Commands

```bash
pnpm install                 # also generates the Prisma client
docker compose up -d         # Postgres 18 (+ peti_test database)
pnpm db:migrate              # apply migrations to DATABASE_URL (dev)
pnpm db:seed                 # demo data (categories, localities, users, outfits, bookings)
pnpm dev                     # http://localhost:3000
pnpm check                   # lint + typecheck + boundaries + unit/component tests
pnpm db:test:prepare         # migrate the peti_test database
pnpm test:integration        # integration tests against peti_test
pnpm build && pnpm test:e2e  # production build + Playwright
pnpm jobs:sweep              # run expiry / auto-complete / outbox dispatch once
```

## 17. Definition of done

A change is done when:

1. The behaviour is implemented end to end (no TODO placeholders for core logic).
2. Domain rules have unit tests; writes have integration tests; journeys have e2e coverage where relevant.
3. `pnpm check`, `pnpm test:integration`, `pnpm build` and the relevant e2e specs pass locally, and CI is
   green.
4. Authorisation is enforced server-side and covered by a test.
5. Inputs are validated; errors map to stable codes; nothing sensitive is logged.
6. Docs that describe the behaviour (architecture, API, ADRs, this file) are updated.
7. The UI follows the design system, works at 390 px and 1440 px, and is keyboard accessible.
