# ADR-001: Technology stack

- Status: Accepted
- Date: 2026-11-11

## Context

Peti needs a TypeScript-first full-stack web application that one small team can build, test and run:
server-rendered public pages for discovery and SEO, authenticated owner/renter/admin areas, a relational
database with strong integrity guarantees for bookings and money, and integrations (payments, storage,
email/SMS) behind replaceable adapters. Versions were verified on 2026-11-11
([stack-verification.md](../research/stack-verification.md)).

## Decision

| Concern            | Choice                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Runtime            | Node 24 LTS, pnpm 10                                                                                     |
| Web framework      | Next.js 16 App Router (Server Components, Server Actions, route handlers), React 19                      |
| Language           | TypeScript 6, strict, `noUncheckedIndexedAccess`                                                         |
| Styling            | Tailwind CSS 4 with CSS-first `@theme` tokens                                                            |
| UI primitives      | Base UI (unstyled, accessible), `@daypicker/react` for calendars                                         |
| Forms / validation | React Hook Form + Zod 4; the same Zod contract is re-parsed on the server                                |
| Database           | PostgreSQL 18                                                                                            |
| ORM                | Prisma 7 with `@prisma/adapter-pg`, exact version pin, raw SQL migrations for constraints                |
| Auth               | Better Auth (email/password, DB sessions, email verification, reset, phone OTP, admin roles, rate limit) |
| Storage            | Port with filesystem (dev) and S3-compatible adapters                                                    |
| Payments           | Port with a local sandbox adapter and a Razorpay (test-mode) adapter — see ADR-005                       |
| Testing            | Vitest 5, Testing Library + jsdom, Playwright                                                            |
| Quality            | ESLint 10 flat config, Prettier, dependency-cruiser, GitHub Actions                                      |

## Alternatives considered

- **Separate API server (NestJS/Fastify) + SPA.** More moving parts and a duplicated contract layer for no
  MVP benefit. Server Actions and route handlers give typed server calls; the modular structure (ADR-002)
  keeps extraction possible later.
- **Drizzle ORM.** A good query builder, but its stable line is still 0.x with 1.0 in release candidates,
  and it does not model EXCLUDE constraints either. Prisma 7's typed client, migrations and documented
  transaction API won; constraint SQL is hand-written in both cases.
- **Prisma 8.** Still a release candidate with breaking changes between RCs, and unsupported by Better
  Auth's adapter. Revisit after GA.
- **Auth.js v5.** Never left beta and is now in maintenance mode; its maintainers recommend Better Auth.
- **Radix UI / React Aria.** Both viable. Base UI is stable, unstyled and maintained; React Aria remains the
  fallback if date-range accessibility needs exceed `@daypicker/react`.
- **TypeScript 7.** No JS API yet; typescript-eslint and Next's checker do not support it.
- **MinIO for local S3.** Archived in April 2026. The filesystem adapter is the dev default; RustFS is
  available in Compose for exercising the S3 adapter.

## Consequences

- One deployable Next.js process plus PostgreSQL. No queue or cache server in the MVP.
- Server Actions mean the UI's "API" is a set of typed functions; external integrations (webhooks) use route
  handlers. `docs/api` documents both.
- The Prisma pin must be bumped deliberately; CI checks for migration drift.
- Node 20 is unsupported; contributors need Node 24 or later.
