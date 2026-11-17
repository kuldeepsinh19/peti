# Peti — project progress report

|                |                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Date           | 2026-11-17                                                                                                 |
| Commit audited | `8085fea` (`main`, clean apart from an untracked `AGENTS.md` that is not part of the project)              |
| Method         | Code, schema, tests and Git history read and re-run; earlier reports used only as pointers, never as proof |
| Code changed   | None                                                                                                       |

**Snapshot.** Peti is a working, well-tested **demonstration** of a peer-to-peer occasionwear rental
marketplace. About **84%** of the product requirements are built, but only about **61%** are proven by an
automated test. Every external integration that would move real money or messages is a **sandbox, an outbox
or untested code**. Peti is **not production-ready**: no launch blocker outside the code (legal settlement
model, live payments, SMS registration, tax, production operations) has been resolved.

**Evidence tags:** **T** = covered by a passing automated test, re-run for this report; **I** = present in
code, no test; **P** = partly built; **M** = missing; **S** = works only against a sandbox, outbox or mock.

---

## 1. Phase-wise progress

Two numbering schemes exist. The MVP audit (`MVP-AUDIT-REPORT.md` §12) planned **four roadmap phases (A–D)**.
Work was then delivered as **three numbered phases** whose scope the owner set, and which do not map one to one
onto A–D.

| Phase                           | Commits | Status        | Scope as set                                                           | Verified outcome                                                                    |
| ------------------------------- | ------: | ------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| MVP build (2026-11-11 → 13)     |     121 | Complete      | The PRD's Must-have product                                            | Audited: 87% of Must requirements by the audit's own count                          |
| Phase 1 — security hardening    |       8 | Complete      | Phase A's security items only (owner's choice)                         | S-02, S-05, S-12, demo lock-down fixed with tests; live-checked                     |
| Phase 2 — payment reliability   |      25 | Code complete | Phase B (reliability) + parts of A (SMS adapter, operations endpoints) | All code sandbox-tested; **nothing exercised against Razorpay or MSG91**            |
| Phase 3 — two-sided marketplace |      22 | Complete      | Owner listing + renter discovery (not in the A–D roadmap)              | 15/15 of its definition of done, e2e-tested; known limitations listed in its report |

| Roadmap phase (audit §12)     | Items | Done | Partial | Not started | Notes                                                                                                                                                                                                                     |
| ----------------------------- | ----: | ---: | ------: | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — safe to invite real users |     5 |    2 |       2 |           1 | Done: proxy/IP and per-account limits; UPI check and admin endpoints. Partial: SMS (adapter, no DLT/provider); production ops (endpoints only, nothing hosted). Not started: terms acceptance at sign-up and legal review |
| B — real money                |     3 |    1 |       1 |           1 | Done: reversal and refund matching (S-04, S-06). Partial: Razorpay adapter rebuilt, never run. Not started: Route/KYC, GST/TDS (blocked outside code)                                                                     |
| C — Must-have product gaps    |     4 |    0 |       1 |           3 | Partial: cover photo and an earnings line (cheapest price only). Missing: public profiles, versioned reports, dispute evidence, overdue label, admin overrides UI, user detail, booking search, activity filters          |
| D — quality                   |     3 |    0 |       0 |           3 | No coverage tooling; axe installed but unused; `booking-view.tsx` still 694 lines; no reminders, deletion or export                                                                                                       |

**Planned: 4 roadmap phases (or 3 numbered + the remainder). Started: A, B, C. Completed: none of A–D in full.
Pending: all of D, most of C, and the external halves of A and B.**

---

## 2. Features implemented, by module

| Module (`src/modules`) | Built                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                 | Email + password, email link verification, password reset, phone OTP, DB sessions, per-IP and per-account limits, locked demo mode                                        |
| `users`                | Profile (display name, bio), addresses (add, remove, default), payout UPI ID, account overview                                                                            |
| `listings`             | Create/edit, 3-step listing flow, multi-photo uploader with cover, status machine, moderation, pause/resume/archive, My outfits                                           |
| `search`               | Explore with full-text + trigram search and filters, categories, saved outfits, outfit page (gallery), lender trust on cards                                              |
| `bookings`             | Request → approve → pay → handover → return → inspection → complete; cancellations; owner blocks; disputes; sweep; availability calendar                                  |
| `payments`             | Provider port, sandbox + Razorpay adapters, manual capture, reversals, refund outbox, reconciliation, chargebacks                                                         |
| `deposits`             | One pure settlement function (property-tested), deposit statuses, reconciliation view                                                                                     |
| `reviews`              | Double-blind reviews, 14-day window, publication sweep, rating aggregates                                                                                                 |
| `notifications`        | In-app inbox + email outbox, SMTP sender, MSG91 SMS sender                                                                                                                |
| `admin`                | Overview, listing moderation, users (suspend/reinstate), bookings, disputes, payouts (paid/failed/held), refund retry, categories (create/hide), activity log, Money page |
| `media`                | Upload validation (magic bytes, size, pixels), sharp re-encode (strips EXIF), filesystem/S3 storage, private file access                                                  |

Size: ~20,900 lines of TypeScript; 45 pages, 7 route handlers, 35 Prisma models, 25 enums, 7 migrations, 3 SQL views.

---

## 3. Working and verified functionality

Re-run on `8085fea` for this report:

| Check                                 | Result                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lint, types, layer rules              | Pass (259 modules, 0 violations)                                                           |
| Unit + component tests                | **134 / 134**                                                                              |
| Integration tests (PostgreSQL)        | **131 / 131**                                                                              |
| Schema drift                          | None                                                                                       |
| End to end (last run, 2026-11-17)     | **14 / 14** (4 specs, 12 tests × desktop/mobile)                                           |
| CI on `8085fea`, `4600b99`, `675c7e2` | Pass, all three jobs                                                                       |
| Live demo                             | `4600b99` deployed (same app code as `8085fea`); readiness, Explore, Journey B passed live |

Verified **T** areas (from the requirements trace of 122 PRD requirements): authentication and verification
gates; server-side authorisation; listing creation, moderation and status machine; search filters (keyword,
category, locality, price, size, measurements, dates); no double booking (DB exclusion constraint + race
tests); the booking state machine and deadlines; payment idempotency, reversals, refunds, reconciliation
(sandbox); deposit settlement conservation; cancellations; disputes; double-blind reviews; payouts and
chargeback holds; append-only history and audit; owner notifications on moderation.

---

## 4. Partially implemented or unverified

| Area                                                              | State | What is missing or unproven                                                                                   |
| ----------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| Payments (Razorpay)                                               | S     | Adapter unit-tested with a mocked SDK; **never run against Razorpay**; live keys refused by config            |
| SMS (MSG91)                                                       | S     | Adapter unit-tested with a mocked fetch; no account or DLT registration; dev outbox used everywhere           |
| Email (SMTP)                                                      | I     | `smtpMailSender` exists; no test; demo and local use the outbox                                               |
| Object storage (S3)                                               | I     | `s3Storage` exists; no test; demo uses a read-only filesystem, so listing uploads are off there               |
| Payouts                                                           | S     | Manual UPI recorded by an admin; no money moves                                                               |
| Terms acceptance at sign-up                                       | P     | Checked in the browser only; not sent to the server or stored                                                 |
| Profile                                                           | P     | No photo, no locality; no public profile page                                                                 |
| Addresses                                                         | P     | No editing                                                                                                    |
| Listing photographs                                               | P     | Minimum is 1 (PRD: 3); no reorder beyond "make cover"                                                         |
| Earnings preview                                                  | P     | Shown for the cheapest price only (PRD: every duration)                                                       |
| Categories admin                                                  | P     | Create and hide only (PRD: rename, reorder, cover image)                                                      |
| Calendar blocks                                                   | I     | Use case and auto-rejection of overlapping requests untested                                                  |
| Saved outfits, sort, category pages, owner history, earnings page | I     | Built, no tests                                                                                               |
| Admin cancel with split                                           | I     | Built, no test                                                                                                |
| Admin handover/return override                                    | P     | Use cases accept admins; **no UI**                                                                            |
| Rentals list                                                      | P     | Not grouped into upcoming / in progress / past                                                                |
| Cancellation preview                                              | P     | Generic tier text, not the exact refund                                                                       |
| Disputes                                                          | P     | Description and amount only; no evidence photos                                                               |
| Notifications                                                     | P     | No notice for "handover recorded" or "payout paid"; no reminders                                              |
| Admin overview / activity                                         | P     | No overdue count; activity log has no filters                                                                 |
| Observability                                                     | P     | Health, readiness and money-health endpoints exist; no request IDs, no error tracking, no monitor configured  |
| Scheduler                                                         | P     | Sweep is correct and idempotent; demo runs it **once a day** (Vercel Hobby); production needs every 5 minutes |

---

## 5. Missing (from the original product vision)

- **Product:** public profiles; account deletion and data export (DPDP); reporting a listing or user; reminders;
  review moderation; overdue label; renter counter-photos; versioned condition reports; admin user detail,
  booking search, activity filters; Could items (similar outfits, review replies).
- **Trust and compliance:** identity verification (status field only; no port, no adapter); GST, TCS and TDS;
  PAN collection; grievance officer details; DPDP consent records.
- **Quality:** coverage tooling; accessibility checks (axe installed, never used); a site-wide Content-Security-Policy.
- **Launch:** production hosting, object storage, a 5-minute scheduler, monitoring and error tracking, tested
  restores; Razorpay live onboarding; MSG91 DLT registration; legal review of terms, privacy and the settlement
  model (a possible RBI payment-aggregator issue — see `docs/compliance/india-marketplace-compliance.md`).

---

## 6. Technical architecture

| Layer        | Current                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Node 24, pnpm 10, TypeScript 6 (strict)                                                                                                                                                                       |
| Web          | Next.js 16.4 App Router (Server Components, Server Actions, `proxy.ts`), React 19.3, Tailwind 4                                                                                                               |
| Data         | PostgreSQL 18, Prisma 7.10 (pg adapter); EXCLUDE, CHECK, triggers, partial indexes, 3 reconciliation views                                                                                                    |
| Auth         | Better Auth 1.7 (DB sessions, phone OTP, admin roles)                                                                                                                                                         |
| Validation   | Zod 4, one contract shared by client and server                                                                                                                                                               |
| Architecture | Modular monolith, 11 modules with domain/application/infrastructure/ui layers, composition root; boundaries enforced by dependency-cruiser in CI                                                              |
| Integrations | Payments: sandbox (active), Razorpay (test keys, unexercised). SMS: outbox (active), MSG91 (unexercised). Email: outbox (active), SMTP (untested). Storage: filesystem (active), S3 (untested). Images: sharp |
| Tests        | Vitest 5 (unit, component, integration on real Postgres), Playwright 1.65 (e2e)                                                                                                                               |
| CI           | GitHub Actions: quality, integration, build + e2e                                                                                                                                                             |
| Hosting      | Demo only: Vercel Hobby + Neon free tier, `APP_ENV=demo` (locked: no sign-up, sandbox payments, no uploads, daily sweep)                                                                                      |

---

## 7. Git history

176 commits, all on `main`, 2026-11-11 → 2026-11-17, Conventional Commits, small and individually typechecked.

| Date     | Commits | Main work                                                      |
| -------- | ------: | -------------------------------------------------------------- |
| 11-11    |      11 | Research, stack decisions, scaffolding                         |
| 11-12    |      90 | MVP build: all modules, demo deployment                        |
| 11-13    |      19 | Code-review fixes                                              |
| 11-14/15 |      27 | MVP audit, Phase 1 security, Phase 2 schema and pipeline begin |
| 11-16    |      23 | Phase 2 completion, Phase 3 begins                             |
| 11-17    |       6 | Phase 3 completion, reports                                    |

Most significant changes: `1b386b0` MVP audit; `4793cfb` Phase 1 report; `94da3c8`/`ca5665e` manual capture and
reversals (S-04); `52b7768` payment reconciliation sweep; `9a238ab` payout failures and chargeback holds;
`7c94622` three-step listing flow; `05ed1fc` shared outfit detail view; `4600b99` owner notifications on
moderation (fixed a gap found during Phase 3).

---

## 8. Overall progress (evidence-based)

**Product requirements** (122 PRD requirements traced to code: 74 T, 17 I, 23 P, 8 M):

| Measure                    | Value   | Calculation                         |
| -------------------------- | ------- | ----------------------------------- |
| Built (any state)          | **84%** | (74 + 17 + 0.5 × 23) / 122          |
| Built and proven by a test | **61%** | 74 / 122                            |
| Missing                    | 7%      | 8 / 122 (several are "Could" items) |

**By phase**

| Phase                         |           Completion | Basis                                                                                                                                           |
| ----------------------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP build                     |                  87% | Audit's computed Must-requirement score (not re-derived here)                                                                                   |
| Phase 1 (security, as scoped) |                 100% | All in-scope findings fixed with regression tests                                                                                               |
| Phase 2 (as briefed)          |                 ~70% | Code and sandbox tests 100%; real-provider verification, Route and tax 0%                                                                       |
| Phase 3 (as briefed)          |                 ~95% | 15/15 done-criteria; limitations: reorder, per-outfit requests, 3-photo minimum                                                                 |
| Roadmap A / B / C / D         | 60% / 50% / 13% / 0% | Items done = 1, partial = 0.5, from §1 (A: 3 of 5; B: 1.5 of 3; C: 0.5 of 4; D: 0 of 3)                                                         |
| **Production readiness**      |             **~20%** | Of the launch prerequisites (hosting, scheduler, monitoring, live payments, SMS, legal, tax), only the code-side safeguards and endpoints exist |

The engineering foundation (data integrity, concurrency, money handling, test coverage of core flows) is
strong. The gap to launch is mostly **outside the codebase**.

---

## 9. Discrepancies between documentation and code

| #   | Document says                                                                            | Code does                                                                                         |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `README.md:146`, `deployment-guide.md:8`: "no SMS provider yet", production cannot start | MSG91 adapter exists; production accepts `SMS_DRIVER=msg91`                                       |
| 2   | `README.md` status: payments via sandbox "or Razorpay in test mode"                      | Razorpay path has never been run, even in test mode                                               |
| 3   | `README.md` features table                                                               | Predates Phases 2–3; overstates categories admin; omits money health, chargebacks, listing flow   |
| 4   | `security-architecture.md:134` (L4): OTP limited per IP only                             | Per-number OTP limit exists (`attempt-limits.ts:12`); the same doc's roadmap list says it is done |
| 5   | PRD FR-LIST-02: at least 3 photographs                                                   | Minimum is 1 (`listings/application/use-cases.ts:119`)                                            |
| 6   | PRD FR-AUTH-01 / FR-CONT-02: terms accepted at sign-up; terms version stored per booking | Sign-up checkbox is client-only; `bookings.terms_version` stores the marketplace-policy version   |
| 7   | `CLAUDE.md:22, 79`, `system-architecture.md`: identity verification is a "port"          | No port or adapter; only a status column defaulting to UNVERIFIED                                 |
| 8   | PRD routes `/verify-email`, `/account/profile`, `/lend` as dashboard                     | Verification via `/api/auth/verify-email`; profile on `/account`; dashboard at `/lend/dashboard`  |
| 9   | PRD NFR-SEC-08: security reviews in `docs/security/`                                     | Folder does not exist; findings live in `security-architecture.md`                                |
| 10  | PRD NFR-A11Y-02: axe in CI                                                               | `@axe-core/playwright` installed, imported by no test                                             |
| 11  | PRD FR-NOTIF-01: notices for handover recorded and payout paid                           | Neither sends a notification                                                                      |

---

## 10. Next steps (prioritised)

1. **Decide the money model with a lawyer** (RBI payment-aggregator rules). It determines payouts, deposits
   and the data model, and blocks real transactions. Engage a chartered accountant for GST/TCS/TDS in parallel.
2. **Fix the documentation drift** (§9 items 1–4, 6–7): cheap, and the README is the project's front door.
3. **Close the legal-record gaps in code:** store terms and privacy acceptance at sign-up (server-side, with
   versions); account deletion and data export for DPDP.
4. **Exercise the real integrations in test mode:** Razorpay test account (deployment-guide checklist), then
   MSG91 after DLT registration; S3/R2 storage; SMTP.
5. **Stand up production operations:** hosting with object storage, a 5-minute scheduler, uptime monitors on
   the health and money-health endpoints, error tracking, a tested restore.
6. **Phase C product gaps:** public profiles (and renter profile on requests), admin override UI, dispute
   evidence uploads, overdue label, address editing, photo reorder, per-duration earnings, grouped rentals.
7. **Phase D quality:** coverage floor, axe in e2e, tests for the untested areas in §4, split
   `booking-view.tsx`, atomic admin audit writes, missing notifications and reminders.
8. Only then: invite a closed group of real owners and renters in Ahmedabad.
