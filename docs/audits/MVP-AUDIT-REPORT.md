# Peti — MVP audit report

|                |                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date           | 2026-11-14                                                                                                                                           |
| Commit audited | `368c17b` (`main`)                                                                                                                                   |
| Auditor        | Claude (AI), acting as architect, full-stack engineer, QA engineer and product auditor                                                               |
| Method         | Test execution, a running production build driven by a real browser, HTTP probes, and code inspection against `docs/product/product-requirements.md` |
| Rule           | Nothing in the application was changed during the audit. A temporary Playwright spec was used and deleted; local demo data was used.                 |

**How to read the evidence tags.** Every claim carries one of:

- **[RUN]** observed while running the app (Playwright, curl or the live demo);
- **[TEST]** proven by an automated test that passed today;
- **[CODE]** read in the source but not executed.

A claim tagged [CODE] is only a claim about what the code says.

---

## 1. Executive summary

**What Peti is today.** A working, well-tested **transaction core** for peer-to-peer occasionwear rental, around which most of the product is built. It is **not yet a real marketplace**: it cannot take real users or real money.

**What it does today, verified.**

- **Accounts.** Sign-up, email confirmation, phone verification through a developer outbox, sign-in and password reset all work [RUN][TEST].
- **Listings.** Create a listing with a photo, submit it, admin approval, then it appears in search. All of this worked in a real browser today [RUN].
- **Booking to payment.** Request → owner approval → sandbox payment → confirmation works end to end in a browser [RUN][TEST].
- **Handover.** Recording the handover with three photos and the renter acknowledging it worked today on a real booking [RUN].
- **The rest of the lifecycle** (return, inspection, completion, cancellation tiers, late fees, disputes, settlement, refunds, payouts, reviews) is proven at use-case level against a real PostgreSQL database by 69 integration tests [TEST]. The return, completion and review screens could not be clicked through today, because the app uses the real clock and no booking had reached its start date [RUN, limitation].
- **No double booking.** This is enforced by a PostgreSQL exclusion constraint and proven under concurrency: of ten simultaneous approvals exactly one wins, and the test fails when the constraint is weakened [TEST].

**What stops it being a real marketplace.**

1. **No SMS provider.** Phone verification is required to book or list, so production refuses to start by design [TEST].
2. **No real money movement.**
   - Razorpay is wired for test keys only and has never been exercised against Razorpay.
   - Owner payouts are recorded by hand.
   - There is no KYC, split settlement, GST or TDS.
3. **The public demo is deliberately insecure.** `/dev/outbox` is open, so anyone can read sign-in codes and reset links [RUN]. It must never hold real users.
4. **Product gaps in Must-have requirements.**
   - No public profile page.
   - No earnings preview on the listing form.
   - No photo reordering, cover choice or 3-photo minimum.
   - No admin UI for handover and return overrides.
   - No overdue label.
   - Thin admin users, bookings and activity pages.
   - No evidence uploads on disputes.
   - Terms acceptance at sign-up is not recorded.
5. **Operations.** No error tracking or alerting. On the free Vercel plan the deadline sweep runs once a day.

**Measured completeness.** Of the **111 Must-have requirements**:

| Status                                              | Count  |
| --------------------------------------------------- | ------ |
| Implemented and covered by a passing automated test | **65** |
| Implemented but not covered by any test             | **21** |
| Partial                                             | **22** |
| Not implemented                                     | **3**  |

Of the **7 Should-have requirements**, 2 are delivered. Details are in §3; the scoring method is in §13.

---

## 2. Architecture and technology stack

**Stack** [CODE, verified by build]:

- **Runtime and framework:** Node 24, pnpm 10, Next.js 16.4 (App Router, Turbopack, `proxy.ts`), React 19.3, TypeScript 6 strict.
- **UI:** Tailwind 4 with CSS tokens.
- **Data and auth:** PostgreSQL 18, Prisma 7.10 (`@prisma/adapter-pg`), Better Auth 1.7 (email and password, phone OTP plugin, admin plugin).
- **Forms:** Zod 4 and React Hook Form.
- **Tests and quality:** Vitest 5, Testing Library, Playwright 1.65, dependency-cruiser.
- **CI:** GitHub Actions, with three jobs: quality, integration, and end-to-end.

**Shape.** A modular monolith:

- 11 modules (`admin`, `auth`, `bookings`, `deposits`, `listings`, `media`, `notifications`, `payments`, `reviews`, `search`, `users`), each with `domain` / `application` / `infrastructure` / `ui` / `index.ts`;
- a `shared` kernel;
- one composition root (`src/composition/container.ts`).

About 17,400 lines of source (excluding generated code) and 3,300 lines of tests.

| Check                                | Result                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer rules (dependency-cruiser)     | **0 violations**, 240 modules and 941 dependencies [RUN]                                                                                   |
| `src/app` importing module internals | **None found** (grep for `@/modules/*/(application\|infrastructure\|domain)` from `src/app`) [CODE]                                        |
| Prisma used directly from routes     | Only in dev tooling: `src/app/dev/outbox/page.tsx` and `src/app/dev/sandbox-checkout/[orderId]/access.ts` [CODE]                           |
| Database integrity                   | 34 tables, 24 enums, 105 named constraints, indexes and triggers in hand-written migrations, 4 triggers, plus a reconciliation view [CODE] |
| Route handlers                       | 6: auth, payment callback, payment webhook, files, cron sweep, health [CODE]                                                               |
| Server Actions                       | 8 action files plus 2 inline actions; every one goes through `runAction` (actor, optional rate limit, error mapping) [CODE]                |

**Assessment.** The architecture matches its documentation and is enforced by tooling, not convention. The weak spots are at the edges, not the core: see §10.

---

## 3. Feature-by-feature completion matrix

**Legend:**

- **T** — implemented and verified by a passing automated test, or by today's browser run.
- **I** — implemented end to end but **unverified**: no test, inspection only.
- **P** — partial.
- **B** — backend only, no UI.
- **N** — not implemented.

Every requirement id comes from `docs/product/product-requirements.md`. _M_, _S_, _C_ and _W_ are Must, Should, Could and Won't (for now).

### 3.1 Authentication and authorisation

| Req                                             | P   | Status | Evidence / gap                                                                                                                                                                    |
| ----------------------------------------------- | --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-01 sign-up + accept terms               | M   | **P**  | Sign-up works [RUN e2e]. The terms checkbox is validated but **the accepted version is not stored**: `acceptTerms` exists only in `users/application/contracts.ts:53` [CODE]      |
| FR-AUTH-02 email verification by link           | M   | T      | e2e `auth.spec.ts` "sign up, confirm email…"                                                                                                                                      |
| FR-AUTH-03 sign in/out, revocable sessions      | M   | T      | e2e; suspension deletes sessions (`reviews-admin.test.ts`)                                                                                                                        |
| FR-AUTH-04 password reset                       | M   | T      | e2e "password reset through the emailed link"                                                                                                                                     |
| FR-AUTH-05 phone OTP by SMS                     | M   | **P**  | Works through the dev outbox [RUN e2e]. **No SMS provider exists** (`env.ts`: `SMS_DRIVER` is `outbox` only)                                                                      |
| FR-AUTH-06 verified email to book or list       | M   | T      | integration "requires verified contact details…"                                                                                                                                  |
| FR-AUTH-07 verified phone to book or list       | S   | T      | same test (`requireVerifiedContact`)                                                                                                                                              |
| FR-AUTH-08 rate limiting per account and per IP | M   | **P**  | Per-IP only. A real limit was observed: 429 from the 11th wrong sign-in [RUN]. It is **bypassable by spoofing `X-Forwarded-For`** when the proxy is not configured [RUN, §7 S-02] |
| FR-AUTH-09 dev outbox, never in production      | M   | T      | `env.test.ts`, `proxy.ts` 404                                                                                                                                                     |
| FR-AUTH-10 roles enforced on the server         | M   | T      | e2e "non-admins cannot reach administration"; the crawl gave 404 on all 8 admin routes for the renter and the owner [RUN]                                                         |
| FR-AUTH-11 social sign-in                       | W   | N      | Out of scope by design                                                                                                                                                            |

### 3.2 Profiles and account

| Req                                                                     | P   | Status | Evidence / gap                                                                                                                                                  |
| ----------------------------------------------------------------------- | --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-PROF-01 display name, **photo**, bio, locality at `/account/profile` | M   | **P**  | Display name, "About you" and locality exist on `/account`. **No profile photo.** The documented route `/account/profile` returns **404** [RUN crawl]           |
| FR-PROF-02 add / **edit** / delete addresses, default                   | M   | **P**  | Add, remove and make default exist. **No edit** (`users/application/use-cases.ts` has `addAddress`, `removeAddress`, `setDefaultAddress` only) [CODE]. No tests |
| FR-PROF-03 public profile page                                          | M   | **N**  | No route exists (route list in §5). Reviews are therefore never shown on a profile                                                                              |
| FR-PROF-04 identity always UNVERIFIED, no badge                         | M   | I      | Nothing writes `identity_verification_status` [CODE]                                                                                                            |
| FR-PROF-05 trust and safety page                                        | M   | I      | Page renders [RUN crawl 200]                                                                                                                                    |
| FR-PROF-06 UPI ID; **payouts cannot be marked paid without one**        | M   | **P**  | The UPI ID can be saved. **`markPayoutPaid` has no UPI check** (`admin/application/admin.ts:250-258`) [CODE]. See issue S-12                                    |
| FR-PROF-07 account deletion                                             | S   | N      | Not found [CODE]                                                                                                                                                |
| FR-PROF-08 data export                                                  | C   | N      | Not found [CODE]                                                                                                                                                |

### 3.3 Listings, photos and moderation

| Req                                                                          | P   | Status | Evidence / gap                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-LIST-01 create a listing with all fields                                  | M   | T      | integration `listings.test.ts`; created in a browser today [RUN]                                                                                                                                                                   |
| FR-LIST-02 **≥3** photos, maximum, **reorder, choose cover**, content checks | M   | **P**  | Upload, maximum of 8, content check and re-encoding all work. A fake JPEG was refused with "Upload a JPEG, PNG or WebP photograph." [RUN]. But only **1** photo is required, and there is **no reordering or cover choice** [CODE] |
| FR-LIST-03 prices per duration                                               | M   | T      | integration "price change does not re-review"                                                                                                                                                                                      |
| FR-LIST-04 deposit ₹500–retail with a hint                                   | M   | T      | integration "rejects invalid money"; hint `listing-form.tsx:206`                                                                                                                                                                   |
| FR-LIST-05 buffer 0–7                                                        | M   | T      | domain tests                                                                                                                                                                                                                       |
| FR-LIST-06 **earnings preview** per duration                                 | M   | **N**  | No preview on the form (`listing-form.tsx` only states "Peti keeps 15%") [CODE]                                                                                                                                                    |
| FR-LIST-07 / 08 statuses, draft, submit, pause, resume, archive              | M   | T      | `listing-domain.test.ts`, `listings.test.ts`                                                                                                                                                                                       |
| FR-LIST-09 bookings keep their snapshot                                      | M   | T      | `guards.test.ts` (snapshot trigger)                                                                                                                                                                                                |
| FR-LIST-10 pause/archive does not cancel bookings                            | M   | I      | Archive is refused while bookings are open (`LISTING_HAS_BOOKINGS`) [CODE]                                                                                                                                                         |
| FR-LIST-11 owner dashboard                                                   | M   | I      | Renders [RUN crawl]; shows open-booking counts                                                                                                                                                                                     |
| FR-LIST-12 optional fields                                                   | C   | P      | Designer/label only                                                                                                                                                                                                                |
| FR-MOD-01 moderation queue with **owner history**                            | M   | **P**  | Photo, price, deposit and retail shown [RUN screenshot]. **No owner history**                                                                                                                                                      |
| FR-MOD-02 approve/reject with a reason                                       | M   | T      | `listings.test.ts`; approved in a browser today [RUN]                                                                                                                                                                              |
| FR-MOD-03 edit a rejected listing and resubmit                               | M   | T      | domain transitions                                                                                                                                                                                                                 |
| FR-MOD-04 suspend a listing                                                  | M   | T      | `listings.test.ts`                                                                                                                                                                                                                 |
| FR-MOD-05 suspend a user, hide their listings                                | M   | T      | `review-fixes.test.ts` "suspended owners…"                                                                                                                                                                                         |
| FR-MOD-06 categories: create, **rename, reorder, slug, cover**, hide         | M   | **P**  | Create and hide only [CODE]                                                                                                                                                                                                        |
| FR-MOD-07 audit-logged moderation                                            | M   | T      | `listings.test.ts` checks the `listing.approve` audit row                                                                                                                                                                          |
| FR-MOD-08 report a listing or user                                           | S   | N      | Not found [CODE]                                                                                                                                                                                                                   |

### 3.4 Search and discovery

| Req                                                                                | P   | Status | Evidence / gap                                                                                                                       |
| ---------------------------------------------------------------------------------- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| FR-DISC-01 landing page, discovery strip, occasions                                | M   | I      | Renders [RUN]                                                                                                                        |
| FR-DISC-02 filters (keyword, category, price, size, measurements, locality, dates) | M   | T      | `listings.test.ts` "filters by keyword (with misspellings), size, price and dates". Locality and measurement filters are [CODE] only |
| FR-DISC-03 date filter respects holds and buffers                                  | M   | T      | same test                                                                                                                            |
| FR-DISC-04 sort                                                                    | M   | I      | `SORTS = newest, price-asc, price-desc, relevance` [CODE]                                                                            |
| FR-DISC-05 category pages                                                          | M   | I      | Render [RUN crawl]                                                                                                                   |
| FR-DISC-06 / 07 detail page; no phone or address shown                             | M   | I      | Renders [RUN]; contact fields are absent from `OutfitDetail` [CODE]                                                                  |
| FR-DISC-08 save / unsave                                                           | M   | I      | No test                                                                                                                              |
| FR-DISC-09 filters kept in the URL                                                 | S   | I      | GET form [CODE]                                                                                                                      |

### 3.5 Availability, booking and concurrency

| Req                                                               | P   | Status | Evidence / gap                                                                                                                             |
| ----------------------------------------------------------------- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-AVAIL-01 owner block/unblock                                   | M   | T      | Block raced against approval in `concurrency.test.ts`; blocked in a browser today [RUN]                                                    |
| FR-AVAIL-02 / 03 no overlapping holds, under concurrency          | M   | T      | `guards.test.ts` two-connection test; "ten concurrent approvals → one wins"                                                                |
| FR-AVAIL-04 a block rejects overlapping requests                  | M   | I      | `calendar.ts` [CODE]                                                                                                                       |
| FR-AVAIL-05 calendar showing held, blocked, buffer and free days  | M   | **P**  | The owner sees a **list** of held ranges, not a calendar (`calendar/page.tsx`). The renter's picker strikes out held days [TEST component] |
| FR-BOOK-01 / 02 price breakdown, terms                            | M   | T      | `request-form.test.tsx`                                                                                                                    |
| FR-BOOK-03 / 04 / 05 request rules, one pending request, snapshot | M   | T      | `lifecycle.test.ts`, `guards.test.ts`                                                                                                      |
| FR-BOOK-06 owner request view with **renter profile and reviews** | M   | **P**  | Dates and earnings are shown. **No renter profile or reviews** [CODE]                                                                      |
| FR-BOOK-07 / 08 / 10 / 11 approve, reject, expiry, auto-reject    | M   | T      | integration                                                                                                                                |
| FR-BOOK-09 withdraw                                               | M   | I      |                                                                                                                                            |
| FR-BOOK-12 rentals **grouped** upcoming / in progress / past      | M   | **P**  | A flat list [CODE]                                                                                                                         |
| FR-BOOK-13 owner history                                          | M   | I      | Renders [RUN]                                                                                                                              |
| FR-BOOK-14 contact details only from CONFIRMED                    | M   | T      | e2e asserts hidden before and shown after; the confirmed booking showed mobile and pickup today [RUN]                                      |
| FR-BOOK-15 append-only history; database refuses illegal changes  | M   | T      | `guards.test.ts`                                                                                                                           |

### 3.6 Payments, deposits and cancellation

| Req                                                                                                                                             | P   | Status | Evidence / gap                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| FR-PAY-01…07 pay, verified capture, idempotent callback + webhook, expiry reconciliation, late capture refund, refund outbox and retry, sandbox | M   | T      | `concurrency.test.ts`, `lifecycle.test.ts`, `review-fixes`, `code-review-fixes`. Sandbox payment completed in a browser [RUN e2e] |
| FR-PAY-08 Razorpay adapter                                                                                                                      | M   | I      | Signature handling has 9 unit tests. **Never run against Razorpay** (no test keys)                                                |
| FR-CANC-01…03, 05 cancellation and tiers                                                                                                        | M   | T      | `lifecycle.test.ts`                                                                                                               |
| FR-CANC-04 admin cancel with an explicit split                                                                                                  | M   | I      | UI present (`booking-view.tsx:374`)                                                                                               |
| FR-DEP-01…06 deposit, single settlement rule, reconciliation, payouts                                                                           | M   | T      | settlement property test (`booking-domain.test.ts`); reconciliation imbalance is 0 in integration tests                           |
| FR-DEP-07 owner earnings page                                                                                                                   | M   | I      | Renders [RUN crawl]                                                                                                               |

### 3.7 Handover, return, disputes and reviews

| Req                                                      | P   | Status | Evidence / gap                                                                                                               |
| -------------------------------------------------------- | --- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| FR-HAND-01 handover report with ≥3 photos from start−1   | M   | T      | integration; **recorded in a browser today** with 3 photos, private photos rendered [RUN]                                    |
| FR-HAND-02 renter acknowledges; **admin override**       | M   | **P**  | Renter acknowledged in a browser [RUN]. **No admin UI** for the override, although the use case allows `ADMIN` → B           |
| FR-HAND-03 reports **immutable once submitted**          | M   | **P**  | Replaceable until acknowledged (known L7)                                                                                    |
| FR-HAND-04 return report; **admin override**             | M   | **P**  | Return refused before the start date — correct rule, seen live [RUN]. Return proven in integration. **No admin override UI** |
| FR-HAND-05 / 06 late fee, 48 h inspection, auto-complete | M   | T      | `lifecycle.test.ts`                                                                                                          |
| FR-HAND-07 **overdue label**                             | M   | **N**  | No overdue label in `booking-view.tsx` [CODE]                                                                                |
| FR-HAND-08 renter counter-photos                         | S   | N      |                                                                                                                              |
| FR-DISP-01…03, 05, 06 disputes                           | M   | T      | `concurrency.test.ts`, `code-review-fixes.test.ts`                                                                           |
| FR-DISP-04 dispute needs **evidence (photos)**           | M   | **P**  | Text only; no upload on the dispute form [CODE]                                                                              |
| FR-DISP-07 admin view: reports side by side              | M   | I      | Booking page [CODE]                                                                                                          |
| FR-REV-01 / 02 / 04 eligibility, double-blind, list      | M   | T      | `reviews-admin.test.ts`, `code-review-fixes.test.ts`                                                                         |
| FR-REV-03 shown on **public profile** and outfit pages   | M   | **P**  | Outfit page only; there is no public profile                                                                                 |
| FR-REV-05 / 06 admin hides a review, owner reply         | S/C | N      |                                                                                                                              |

### 3.8 Notifications, admin and content

| Req                                                                            | P   | Status | Evidence / gap                                                                                          |
| ------------------------------------------------------------------------------ | --- | ------ | ------------------------------------------------------------------------------------------------------- |
| FR-NOTIF-01 in-app + email per event                                           | M   | I      | Writer runs in the booking transaction; 18 emails were delivered by the sweep on 2026-11-12 [RUN]       |
| FR-NOTIF-02 deadline reminders                                                 | S   | N      |                                                                                                         |
| FR-NOTIF-03 written in the transaction, sent after                             | M   | T      | outbox tests                                                                                            |
| FR-ADMIN-01 overview incl. **overdue rentals**                                 | M   | **P**  | Figures: listings to review, disputes, payouts, failed refunds. **No overdue count** (`admin/page.tsx`) |
| FR-ADMIN-02 users: search, **profile, bookings, cancellation count, disputes** | M   | **P**  | Search and suspend/reinstate only                                                                       |
| FR-ADMIN-03 bookings: **search**, filter, detail, **overrides**, cancel        | M   | **P**  | Status filter, detail and cancel only                                                                   |
| FR-ADMIN-04 disputes                                                           | M   | I      | Queue page plus booking page                                                                            |
| FR-ADMIN-05 payouts                                                            | M   | T      | `reviews-admin.test.ts` audited payouts                                                                 |
| FR-ADMIN-06 activity, **filterable**                                           | M   | **P**  | Unfiltered list of 200 [CODE]                                                                           |
| FR-ADMIN-07 refund retry                                                       | M   | T      | `code-review-fixes.test.ts`                                                                             |
| FR-CONT-01 / 03 how it works, trust                                            | M   | I      | Render [RUN]                                                                                            |
| FR-CONT-02 terms versioned, **accepted version recorded**                      | M   | **P**  | Bookings store `terms_version`; sign-up acceptance is not stored                                        |

### 3.9 Cross-cutting

| Area                    | Status        | Evidence                                                                                                                                                                                        |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive UI           | T (layout)    | **0 px horizontal overflow** on all 144 crawled page views (desktop) and on 8 key pages at 390 px [RUN]                                                                                         |
| Accessibility           | P             | axe WCAG 2 A/AA on 10 pages: **1 serious violation** (colour contrast, `.text-brass.numeral`, 3 nodes, home page); the other 9 clean [RUN]. axe is installed but **not part of the test suite** |
| Identity verification   | N (by design) | Nothing claims it                                                                                                                                                                               |
| Real SMS, real payments | N             | See §1                                                                                                                                                                                          |

---

## 4. Working versus non-working functionality

### Verified working in a browser today [RUN]

1. Every page renders for its intended role:
   - 37 routes × 4 roles = 144 page views;
   - anonymous visitors are redirected to sign-in from all protected areas;
   - renter and owner get **404 on all 8 admin routes**.
2. **Internal links:** 93 checked, **0 broken**. The only 404 is a listing still in review, correctly hidden from anonymous visitors.
3. **Sign-up flow:** sign-up → email link → phone OTP → sign-out → sign-in → password reset (e2e).
4. **Listing flow:**
   - create a listing;
   - a fake image is refused;
   - a real photo uploads, its metadata is stripped and it is re-encoded;
   - submit → admin "Approve and publish" → found in search;
   - HTML in the description is rendered as text, with no script execution;
   - an owner calendar block is saved.
5. **Booking flow:**
   - request → owner approval → sandbox checkout → confirmed (e2e);
   - contact details hidden before payment, shown after;
   - another member gets 404 on someone else's booking.
6. **Handover:** recorded with 3 photos; the renter acknowledges; the booking becomes "With the renter".
7. **Security behaviour:** see §7 for the full list of probes.

### Verified only by automated tests, not through the UI today

Return and inspection, completion, late fees, all cancellation tiers, disputes (accept, withdraw, admin decision, automatic disputes), the review UI flow, refunds, payouts and the reconciliation view.

**Why:** the app uses the real clock, so a return dated before a booking's start is refused — correctly. No local booking had started yet.

### Not working or not built

- **Not built at all:**
  - public profiles;
  - the listing earnings preview;
  - the overdue label;
  - account deletion and data export;
  - reporting a listing;
  - reminders;
  - review moderation;
  - renter counter-photos;
  - dispute evidence uploads;
  - address editing;
  - photo reorder/cover;
  - category rename/reorder/cover.
- **Partly built, with no UI:**
  - admin override of handover and return;
  - admin user detail;
  - booking search;
  - activity filters.
- **Broken route:** `/account/profile`, named in the requirements, returns 404. The page lives at `/account`.
- **Wrong per the requirements:** a payout can be marked paid with no UPI ID on file.
- **Cannot run in production:** SMS, live payments and automated payouts.

---

## 5. Test execution results (2026-11-14, commit `368c17b`)

| Suite                                   | Command                                        | Result                                                                                                                         |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Lint (ESLint, zero warnings allowed)    | `pnpm check`                                   | **Pass**                                                                                                                       |
| Types (`next typegen` + `tsc --noEmit`) | `pnpm check`                                   | **Pass**                                                                                                                       |
| Layer boundaries                        | `pnpm check`                                   | **Pass**: 0 violations                                                                                                         |
| Unit + component                        | `pnpm check`                                   | **86 / 86 pass** (9 files, 51 s)                                                                                               |
| Integration (real PostgreSQL 18)        | `pnpm test:integration`                        | **69 / 69 pass** (7 files, 55 s)                                                                                               |
| Schema drift                            | `pnpm db:drift`                                | **No drift** (exit 0)                                                                                                          |
| Fresh database                          | `migrate deploy` on a new database, seed twice | All 5 migrations apply; `btree_gist` and `pg_trgm` present; the seed is **idempotent** (6 users and 11 outfits after two runs) |
| Production build                        | `pnpm build`                                   | **Pass**: 49 routes                                                                                                            |
| End to end (Chromium, desktop + mobile) | `pnpm test:e2e`                                | **11 / 11 pass**                                                                                                               |
| CI (GitHub Actions)                     | last run on `368c17b`                          | **Pass**: all 3 jobs                                                                                                           |
| Audit crawl, axe, mobile, journeys      | temporary spec                                 | See §3–4. One journey step stopped only because of the real-clock rule above                                                   |

**Total:** 166 automated tests, all passing.

**Coverage is not measured.** No coverage tool is installed; adding one would have changed `package.json`, so I didn't. The test inventory by module shows **no direct tests** for:

- the users module (profile, addresses);
- media (upload validation, the sharp re-encode);
- the notifications inbox;
- file-access control (`fileAccess.canView`);
- most admin user and category actions;
- search's saved-outfit toggle.

---

## 6. Database and API audit

**Schema** [CODE + RUN]:

- 34 tables.
- Integrity lives in the database, not only in code:
  - the exclusion constraint against double booking;
  - CHECK constraints on money identities;
  - composite foreign keys tying a booking's owner to the outfit;
  - a trigger that allows only legal booking status changes;
  - an immutable pricing snapshot;
  - append-only history and audit tables;
  - partial unique indexes (one pending request, one open dispute, one default address);
  - a reconciliation view.
- `guards.test.ts` proves each guard by writing raw SQL past the application [TEST].
- Migrations apply cleanly to an empty database and match the schema [RUN].

**Database concerns.**

| Sev    | Problem                                                                   | Evidence                                                             | Fix                                                                   |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Medium | Pickup address is read live, not snapshotted on the booking               | known L10; `booking-queries.ts` joins the current address            | Copy the address into the booking at confirmation                     |
| Medium | An admin action and its audit row are separate transactions               | `admin.ts` calls `admin.*` then `audit.record` on a different client | Run both in one transaction                                           |
| Low    | `identity_verification_status` and parent categories exist but are unused | [CODE]                                                               | Keep, documented as reserved, or drop                                 |
| Low    | Prisma pool of 10 per process; on serverless each instance opens its own  | `shared/infrastructure/prisma.ts`                                    | Use Neon's pooled URL (the demo does) and lower the pool per instance |

**API.**

- **Route handlers.** 6, each authorising appropriately:
  - files: public prefix, or `canView`;
  - webhook: HMAC over the raw body;
  - callback: signature plus a provider re-fetch;
  - cron: bearer secret compared in constant time;
  - auth: Better Auth.
- **Server Actions.** All go through `runAction` [CODE]. Probes are in §7.
- **No public JSON API.** Fine for an MVP; mobile apps would need one.

---

## 7. Security vulnerabilities and risks

**Verified behaving correctly** [RUN]:

- **Headers:** `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy are set; the live site also has HSTS.
- **Session cookie:** `HttpOnly; SameSite=Lax`.
- **Origin check:** a cross-origin sign-in gets **403 `INVALID_ORIGIN`**.
- **Phone endpoints:** phone sign-in and phone password reset return **404** (disabled); phone verify without a session returns **403**.
- **File route:** path traversal (`..%2F`, `%2e%2e`, `../`) returns **404**, and private report files without a session return **404**.
- **Webhooks:** unsigned or bad-signature webhooks return **401**; an unknown provider returns **404**.
- **Cron:** without the secret, or with a wrong one, it returns **401**.
- **Payment callback:** a forged or non-form callback **303-redirects to `?payment=invalid`**; nothing is confirmed.
- **Rate limit:** a real 10-per-minute sign-in limit; the 11th attempt gets **429**, applied per IP across email addresses.
- **XSS:** HTML in listing text is rendered inert.

| ID   | Sev                 | Area / file                      | Problem                                                                                                                                                      | Evidence                                                                                                                     | Recommendation                                                                                                                                                         |
| ---- | ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | **Critical (demo)** | Vercel demo, `APP_ENV=test`      | `/dev/outbox` is public, so anyone can read any sign-in code or reset link and take over any demo account                                                    | `curl https://peti-kappa.vercel.app/dev/outbox` → 200 [RUN]                                                                  | Acceptable **only** with fictional data. Never invite real users to the demo. A real deployment uses `APP_ENV=production` (refused today until an SMS provider exists) |
| S-02 | **High**            | `better-auth.ts` IP detection    | Auth rate limits are keyed on `X-Forwarded-For` by default. When the app is reachable directly, a client rotating the header gets a fresh limit              | After a 429 lockout, 3 requests with spoofed `X-Forwarded-For` → 401, 401, 401 (not 429) [RUN]                               | Set `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES` for the real proxy; add a per-account limit (FR-AUTH-08 asks for one)                                                 |
| S-03 | High                | Demo deployment                  | Test-mode auth limits are 20× looser                                                                                                                         | 12 wrong live sign-ins, none throttled [RUN]                                                                                 | Not for real users (see S-01)                                                                                                                                          |
| S-04 | High                | `payments.ts`                    | A second or mismatched capture is only flagged; the refund is manual                                                                                         | known M3; `code-review`/`review-fixes` tests                                                                                 | Automate reversal through the refund outbox                                                                                                                            |
| S-05 | High                | Better Auth admin plugin         | `/api/auth/admin/*` (impersonate, set role, set password) bypasses the app's audit log                                                                       | known S3 [CODE]                                                                                                              | Disable unused admin endpoints, or wrap them with audit logging                                                                                                        |
| S-06 | Medium              | `refund.processed` webhook       | A refund confirmed before its provider id is stored is not matched                                                                                           | known M2                                                                                                                     | Match on `notes.reference` too                                                                                                                                         |
| S-07 | Medium              | Redirect notices                 | `?error=` text is shown as given, so links can be crafted to show any message (no XSS)                                                                       | known L2                                                                                                                     | Pass error codes and map them to messages                                                                                                                              |
| S-08 | Medium              | `next.config.ts`                 | No site-wide Content-Security-Policy                                                                                                                         | headers [RUN]                                                                                                                | Nonce-based CSP covering Razorpay Checkout                                                                                                                             |
| S-09 | Medium              | Condition reports                | A handover report can be replaced until the renter acknowledges it                                                                                           | known L7                                                                                                                     | Version reports; make them immutable                                                                                                                                   |
| S-10 | Low                 | Sessions                         | 14-day session, no idle timeout                                                                                                                              | `Max-Age=1209600` [RUN]                                                                                                      | Shorter idle timeout for admin sessions                                                                                                                                |
| S-11 | Low                 | Secrets                          | `.env` handling is sound. `.vercelignore` keeps `.env` out of uploads; production refuses placeholder secrets and sandbox keys                               | `env.test.ts` [TEST]                                                                                                         | —                                                                                                                                                                      |
| S-12 | High                | `admin/application/admin.ts:250` | A payout can be marked paid when the owner has no UPI ID on file, contrary to FR-PROF-06, so money could be "sent" to nowhere and the record still says paid | `markPayoutPaid` checks only status and reference [CODE]; `/admin/payouts` shows "Not provided" yet still offers "Mark paid" | Refuse with `NO_PAYOUT_ACCOUNT` unless a UPI ID exists; hide the button                                                                                                |

**Privacy:**

- No identity documents are collected.
- Locality only is shown on listings.
- Contact details are released only from CONFIRMED [TEST/RUN].
- Photos are re-encoded with EXIF and GPS removed [CODE].
- **Missing:** account deletion and data export (FR-PROF-07/08), and a record of privacy-notice acceptance.

---

## 8. UI/UX findings

**Strengths** [RUN screenshots, desktop and 390 px]:

- **A distinctive editorial identity, not a template:**
  - a Bodoni display face with a Gujarati wordmark;
  - hairline rules and square corners;
  - numbered index navigation;
  - asymmetric photo grids;
  - the "The wardrobe" hero on explore.
- No horizontal overflow anywhere tested.
- Empty, error and success notices exist on the action pages.
- Buttons disable while submitting (`SubmitButton`).

| ID   | Sev    | Where                                        | Problem                                                                                                                | Evidence                                     | Recommendation                                                                  |
| ---- | ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| U-01 | Medium | Owner calendar                               | Held dates are a list; no month view showing free, held, blocked and buffer days (FR-AVAIL-05)                         | `calendar/page.tsx` [CODE]                   | Reuse the renter's DayPicker in read-only mode, with patterns, not colour alone |
| U-02 | Medium | Booking page                                 | No "overdue" state; an active rental past its end date looks like any other                                            | [CODE]                                       | Add an overdue badge and copy (FR-HAND-07)                                      |
| U-03 | Medium | Booking page (`booking-view.tsx`, 677 lines) | After the renter acknowledges on the day before the start, "Record return" is offered but refused until the start date | Seen live [RUN]                              | Hide or disable "Record return" before the start date, with an explanation      |
| U-04 | Medium | Listing form                                 | No per-duration earnings preview (FR-LIST-06); owners must do the commission maths themselves                          | [CODE]                                       | Show "you receive ₹x" under each price                                          |
| U-05 | Low    | Home                                         | Brass numerals fail contrast (axe "serious", 3 nodes)                                                                  | axe [RUN]                                    | Use the darker brass token for text                                             |
| U-06 | Low    | Mobile index bar                             | The tab row scrolls sideways with no affordance ("Rental histor…" cut off)                                             | 390 px screenshot of `/lend/dashboard` [RUN] | Add a fade or overflow cue, or wrap                                             |
| U-07 | Low    | `/account/rentals`                           | Flat list; not grouped upcoming, in progress, past (FR-BOOK-12)                                                        | [CODE]                                       | Group by status                                                                 |
| U-08 | Low    | Search                                       | A page past the last one shows "0 outfits"                                                                             | known                                        | Redirect to the last page                                                       |
| U-09 | Low    | Admin listing card                           | Two "Reason" fields stacked with no grouping are confusing                                                             | screenshot [RUN]                             | One reason field per action, inside a disclosure                                |

---

## 9. Missing functionality (priority order)

1. **Must, missing or partial:**
   - public profile (FR-PROF-03);
   - earnings preview (FR-LIST-06);
   - overdue label (FR-HAND-07);
   - photo minimum of 3, reorder, cover (FR-LIST-02);
   - admin override UI for handover and return (FR-HAND-02/04, FR-ADMIN-03);
   - immutable reports (FR-HAND-03);
   - dispute evidence uploads (FR-DISP-04);
   - UPI check on payouts (FR-PROF-06);
   - address editing (FR-PROF-02);
   - profile photo (FR-PROF-01);
   - terms acceptance recorded at sign-up (FR-AUTH-01, FR-CONT-02);
   - per-account rate limit (FR-AUTH-08);
   - owner calendar view (FR-AVAIL-05);
   - renter profile and reviews on requests (FR-BOOK-06);
   - grouped rentals (FR-BOOK-12);
   - admin overview overdue count, user detail, booking search, activity filters (FR-ADMIN-01/02/03/06);
   - category rename, reorder and cover (FR-MOD-06);
   - owner history in moderation (FR-MOD-01).
2. **Should, missing:**
   - account deletion (FR-PROF-07);
   - report a listing or user (FR-MOD-08);
   - renter counter-photos (FR-HAND-08);
   - review moderation (FR-REV-05);
   - deadline reminders (FR-NOTIF-02).
3. **Launch infrastructure:**
   - an SMS provider with DLT registration;
   - Razorpay live mode with KYC and Route (split settlement);
   - GST and TDS handling;
   - error tracking and alerting;
   - a scheduler running every few minutes;
   - durable object storage for uploads (S3/R2);
   - backups, tested by restoring.

---

## 10. Technical debt and architectural concerns

| Sev    | Concern                                                                                 | Evidence                                                                | Recommendation                                                                    |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Medium | `booking-view.tsx` (677 lines) renders every status × role combination in one component | `wc -l` [RUN]                                                           | Split by status: request, payment, handover, rental, return, dispute              |
| Medium | Admin mutations are not atomic with their audit rows                                    | §6                                                                      | Run each in a single transaction                                                  |
| Medium | The demo depends on an uncommitted `demo-storage/` directory and a manual local seed    | deployment guide                                                        | Seed and deploy photos from CI, or use object storage                             |
| Medium | Test gaps (users, media, inbox, file access); coverage not measured; axe not in CI      | §5                                                                      | Add `@vitest/coverage-v8` with a floor; an axe e2e smoke; tests for those modules |
| Low    | Several redirect-with-`?error=` helpers are repeated across actions                     | `account/actions.ts`, `admin/actions.ts`, `_actions/bookings.ts` [CODE] | One helper (it also fixes S-07)                                                   |
| Low    | Generated `AGENTS.md` keeps reappearing untracked                                       | `next dev` writes it                                                    | Commit it or ignore it                                                            |
| Low    | The "completed" notification wording ignores the settlement result                      | known                                                                   | Build the text from the settlement                                                |
| Low    | `addPhoto` and its status change aren't atomic                                          | known                                                                   | One transaction                                                                   |

**No duplicated business rules found** in the main paths:

- settlement is one function;
- role resolution is one function, now consistent with the page;
- policy values live in one file.

---

## 11. Production-readiness assessment

**Verdict: not production-ready.** It is ready as a demo and as a foundation.

| Gate                                | State                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Correctness of the transaction core | **Ready**: tested against a real database, concurrency-proof                                       |
| Security of the core                | **Mostly ready**: probes pass. S-02 needs deployment configuration; S-04, S-05 and S-06 are open   |
| Phone verification                  | **Blocked**: no SMS provider; production refuses to start                                          |
| Real payments and payouts           | **Blocked**: test keys only, no live review, no split settlement, no tax handling                  |
| Legal                               | **Blocked**: terms and privacy are unreviewed drafts; acceptance is not recorded                   |
| Operations                          | **Blocked**: no monitoring or alerting; daily sweep on the free plan; no durable uploads on Vercel |
| Product completeness (Musts)        | **Not met**: 25 of 111 Must requirements are partial or missing                                    |

---

## 12. Prioritised implementation roadmap

**Phase A — make it safe to invite real users** (blockers)

1. An SMS provider adapter (MSG91, Twilio or similar), DLT templates, and a per-number OTP limit (§1 blocker 1, FR-AUTH-05/08).
2. Configure `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES` for the real host; add a per-account sign-in limit (S-02).
3. Record terms and privacy acceptance at sign-up; get both documents legally reviewed (FR-AUTH-01, FR-CONT-02).
4. Production hosting with `APP_ENV=production`:
   - S3 or R2 storage;
   - a scheduler every 5 minutes;
   - error tracking and alerts on sweep failures, failed refunds and `payment.unexpectedCapture`;
   - backups with restore drills.
5. The payout UPI check (S-12). Disable or audit Better Auth's admin endpoints (S-05).

**Phase B — real money**

6. Razorpay live onboarding: run the adapter end to end against test keys, then live keys; turn on automatic capture.
7. Automatic reversal of unexpected captures; refund webhook matching by reference (S-04, S-06).
8. Razorpay Route (or equivalent) for owner payouts and KYC; GST on commission and TDS, with professional advice.

**Phase C — close the Must-have product gaps**

9. Public profiles with reviews; renter profile on requests.
10. Earnings preview; photo minimum, reorder and cover; profile photo; address editing.
11. Immutable, versioned condition reports; dispute evidence uploads; overdue label; hide "Record return" before the start.
12. Admin tools: handover and return override UI, user detail, booking search, activity filters, overdue count, category editing, owner history.

**Phase D — quality**

13. Coverage tooling with a floor; tests for users, media, inbox and file access; axe in CI; fix the contrast issue.
14. Split `booking-view.tsx`; make admin and audit writes atomic; a single redirect-error helper with error codes (S-07).
15. The Should items: reminders, account deletion and data export, reporting, review moderation, counter-photos.

---

## 13. Overall completion scores

Each score states how it was calculated. The scores are **out of 10**, and where a number comes from counts, the counts are shown. They are judgements anchored on evidence, not measurements, except where marked "computed".

| Area                             | Score        | How it was calculated                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product feature completeness** | **7 / 10**   | _Computed_ over the 111 Must requirements in §3: 65 T + 21 I + 0.5 × 22 P + 0 × 3 N = 97, and 97 / 111 = 0.87. Then lowered because 2 of 7 Should items are delivered, and the two capabilities a marketplace cannot run without (SMS, live money) are absent                                                                       |
| **Backend functionality**        | **8 / 10**   | 69 integration and 86 unit tests pass against real PostgreSQL. Concurrency, settlement and idempotency are proven. Deductions: payout UPI rule missing, manual reversal of unexpected captures, refund webhook matching gap, non-atomic admin audit, Razorpay never run live                                                        |
| **Frontend functionality**       | **6.5 / 10** | All 37 routes render for the right roles; no broken links; the key journeys work in a browser. Deductions: one documented route 404s; a long list of Must UI pieces missing (public profile, earnings preview, owner calendar view, admin overrides, overdue state, photo ordering, dispute evidence); only one component test file |
| **Database correctness**         | **9 / 10**   | Clean migrations from empty; no drift; idempotent seed; 105 named constraints and triggers, each guard proven by raw-SQL tests; the exclusion constraint proven by a mutation check. Deductions: no pickup-address snapshot; audit not atomic with admin writes                                                                     |
| **Security**                     | **6.5 / 10** | Every probe in §7 behaves correctly, and two independent code reviews were fixed with tests. Deductions: S-02 rate-limit bypass when misconfigured (verified); open S-04 / S-05 / S-06; no CSP. The demo is deliberately unsafe (S-01) — not counted against the product, but it must never hold real users                         |
| **Testing coverage**             | **6.5 / 10** | 166 automated tests, all green, with strong integration depth on money and concurrency. Deductions: **coverage not measured**; no tests for users, media, inbox or file access; e2e stops at payment confirmation; axe installed but unused                                                                                         |
| **UI/UX quality**                | **7 / 10**   | A distinctive, consistent brand; responsive with no overflow; axe clean on 9 of 10 pages; submit and error states handled. Deductions: missing owner calendar and overdue states, a confusing early "Record return", contrast issue, thin admin tooling                                                                             |
| **Production readiness**         | **3 / 10**   | The core is ready, but four launch gates are blocked: SMS, real payments and payouts, legal, operations (§11)                                                                                                                                                                                                                       |

**Unverified areas** (stated so that no score above relies on them silently):

- **Razorpay:** the adapter has never been run against Razorpay.
- **Real email:** SMTP delivery has never been run, only the dev outbox.
- **S3 storage:** the adapter has never been run, only the filesystem.
- **Return, completion and review screens:** proven only at use-case level today, because of the real clock.
- **Coverage:** no percentage measured.
- **Performance and load:** not tested.
- **Screen-reader testing:** only automated axe checks, no manual pass.

---

_Generated from evidence collected on 2026-11-14. Commands for every [RUN] or [TEST] claim are listed in §5. The temporary audit spec and its outputs were not committed._
