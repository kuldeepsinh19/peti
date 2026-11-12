# Contributing to Peti

Thank you for helping. Peti handles other people's expensive garments and money, so correctness matters more
than speed. Please read [CLAUDE.md](CLAUDE.md) first — it is the working agreement for humans and coding
agents alike.

## Getting started

Follow [local setup](docs/development/local-setup.md), then run `pnpm check` and
`pnpm test:integration` to confirm a clean baseline before changing anything.

## How to propose a change

1. Open an issue describing the problem or the behaviour you want, before writing code for anything larger
   than a typo.
2. Branch from `main`.
3. Make small, logical commits that each build and pass tests. Use Conventional Commits
   (`feat(bookings): …`, `fix(payments): …`, `docs: …`, `test: …`).
4. Open a pull request that explains what changed and how you tested it. CI must be green.

## Rules that are not negotiable

- Business rules live in `src/modules/*/domain` and `application`, never in components or route handlers.
- Every use case authorises its actor on the server. Hiding a button is not authorisation.
- Money is integer paise. Rental days are `LocalDate` values in Asia/Kolkata.
- Booking status changes only through the state machine; never update `bookings.status` directly.
- Anything the database can enforce, it does — add a named constraint in a new migration, and a test that
  proves it rejects bad data. Never edit an applied migration.
- No fabricated data: no invented testimonials, user counts or metrics, in code, seed data or docs.
- No identity documents, and no claims that a person is identity-verified.

## Tests you are expected to add

| Change                     | Tests                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| Domain rule                | Unit test, including boundaries (dates in IST, rounding)               |
| Use case that writes       | Integration test against PostgreSQL, including an authorisation denial |
| Concurrency-sensitive path | A test that runs the operation concurrently                            |
| User-facing journey        | Playwright spec where it adds confidence                               |

A bug fix starts with a failing test.

## Code review checklist

- [ ] Boundaries respected (`pnpm boundaries` passes)
- [ ] Inputs validated with the module's Zod contract
- [ ] Authorisation enforced and tested
- [ ] Errors use stable codes; nothing internal is leaked to users or logs
- [ ] Docs updated (architecture, API, ADRs, CLAUDE.md) where behaviour changed
- [ ] UI follows [design direction](docs/product/design-direction.md) and works at 390 px and 1440 px

## Use of AI assistants

AI-assisted contributions are welcome if you understand and can explain every line, the tests are real, and
you have run them. Say in the pull request that an assistant was used.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
