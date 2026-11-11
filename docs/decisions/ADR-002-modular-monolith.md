# ADR-002: Modular monolith with layered modules

- Status: Accepted
- Date: 2026-11-11

## Context

The domain has clearly separable areas (listings, availability, bookings, payments, deposits, disputes,
reviews, admin) with strict rules that must be testable without a browser or database. The team is small
and the MVP must ship as one deployable unit, but the brief asks that it stay ready for extraction.

## Decision

Build one Next.js application organised as **feature modules** under `src/modules/<name>/`, each with four
layers:

- `domain/` — pure TypeScript: value objects, state machines, policies, domain errors. No framework, ORM or
  I/O imports.
- `application/` — one use case per file, **ports** (interfaces) for everything external, and Zod
  contracts. Depends only on domain and ports.
- `infrastructure/` — Prisma repositories and provider adapters implementing the ports.
- `ui/` — React components for the module.

Plus `index.ts` as the module's public surface, a `shared/` kernel (money, dates, errors, actor, prisma,
design system) and a single **composition root** (`src/composition/container.ts`) that binds adapters to
ports from validated configuration. Next.js routes in `src/app` are thin: they call use cases from the
container.

These rules are enforced by dependency-cruiser in CI (`pnpm boundaries`), not by convention.

Transactions: use cases that must be atomic receive a transaction-runner port; the Prisma implementation
opens an interactive transaction and passes transaction-scoped repositories. Business-critical sequences
(approve booking, take the calendar hold, write history) are therefore atomic without the domain knowing
about Prisma.

## Alternatives considered

- **Microservices.** Distributed transactions across booking, payment and availability would be the
  hardest part of the system, for no benefit at this scale.
- **Classic layered app (one `services/` folder).** Tends towards god services and cross-feature coupling;
  module boundaries make ownership and future extraction explicit.
- **Full hexagonal with a repository for every read.** Over-abstraction for list and detail pages. Read
  models use query ports implemented with Prisma or SQL in infrastructure.

## Consequences

- Domain rules are unit-testable in milliseconds; use cases are integration-tested against real Postgres.
- Cross-module calls go through `index.ts`, so a module could later move behind an HTTP or queue boundary by
  replacing its index with a client.
- Some ceremony per feature (contract, use case, port, adapter), limited by adding ports only where a real
  seam exists.
