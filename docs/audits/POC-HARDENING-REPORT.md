# POC hardening report

**Date:** 17–19 November 2026 · **Scope:** the whole application, after the MVP and Phases 1–3 ·
**Baseline:** [project progress report](PROJECT-PROGRESS-REPORT.md) (commit `0fb968f`)

## 1. Summary

Peti is now a stable, demonstrable proof of concept. All ten core journeys can be shown on a local machine,
and each is covered by an end-to-end test in Chromium. A defect hunt found 36 problems: 34 are fixed,
each with a test that failed before the fix. One was a false positive (kept as a test); one is documented
and left open. Everything simulated is labelled as simulated.

| Measure                                                 | Before (`0fb968f`) | After       |
| ------------------------------------------------------- | ------------------ | ----------- |
| Unit and component tests                                | 134                | **154**     |
| Integration tests (real PostgreSQL)                     | 131                | **168**     |
| End-to-end tests (Chromium)                             | 14                 | **20**      |
| Accessibility (axe) in the test run                     | none               | 6 key pages |
| Defects found / fixed / open                            | —                  | 36 / 34 / 1 |
| Documentation discrepancies (§9 of the progress report) | 11                 | 0           |

Final gate, run on 19 November 2026: `pnpm check` (lint with no warnings, types, architecture
boundaries, unit and component tests), `pnpm test:integration`, `pnpm db:drift` ("No difference
detected"), `pnpm build` and `pnpm test:e2e`. All passed. GitHub CI passed for the first 38 commits, which were pushed on 18 November. The commits made after that, this
report included, are not pushed yet.

**Nothing is deployed.** The public demo still runs the code from before this work; see §8.

## 2. What was inspected

- **Every Server Action, route handler and use case** in `src/`, plus the Better Auth 1.7.21 sources
  wherever behaviour depended on them. A read-only "security and integrity" pass produced the 36 findings.
- **The ten journeys from the brief**, walked through in the code and the running app, both locally and on
  the public demo's configuration. This pass found the usability gaps in §5.
- **The documentation**, compared claim by claim with the code (the 11 discrepancies in the progress
  report).

The code was treated as the source of truth throughout. Every fix was first written as a failing test.
Key protections were also mutation-checked: removing the fix makes the test fail again. This covered the
photograph locks, the rate-limit guard, the cancel button and the payment-order race.

## 3. Owner decisions

1. **The ten journeys are demonstrated on a local POC.** The public demo is hardened as a read-only
   showcase, and nothing is deployed or pushed without approval.
2. **Rentals that take days use ready-made bookings dated relative to today**, created through the real
   flow. There is no fake clock, and no business rule was changed.
3. **A listing needs three photographs to be submitted or approved**, as the requirements say. Drafts may
   have fewer.

## 4. Findings and what was done

The finding numbers are those of the defect hunt. "Test" names the regression test. Unless another file is
given, it is in `tests/integration/security/poc-hardening.test.ts`.

### High

| #   | Finding                                                                          | Outcome                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sign-up might let someone claim another person's phone number                    | **False positive.** Better Auth already refuses `phoneNumber` at sign-up (`PHONE_NUMBER_CANNOT_BE_SET`). A guard committed before this was checked was reverted. The test that proves the refusal stays (`auth-hardening.test.ts`) |
| 2   | Two checkout clicks created two provider orders; a payment on the first was lost | **Fixed.** Storing the order id is now a compare-and-swap, and the losing call reuses the winner's order (`payment-reliability.test.ts`)                                                                                           |

### Medium

| #   | Finding                                                                                                    | Outcome                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | An administrator who was a party could decide their own dispute                                            | **Fixed.** Refused (test)                                                                                                                                                        |
| 4   | An administrator could mark their own payout paid                                                          | **Fixed.** Refused, also for recording a failure (test)                                                                                                                          |
| 5   | The renter was never told the handover had been recorded                                                   | **Fixed.** The renter gets an in-app and email notice (test)                                                                                                                     |
| 6   | A renter could acknowledge a handover report they never saw                                                | **Fixed.** The form carries the report version; a changed report is refused with `REPORT_CHANGED` (test)                                                                         |
| 7   | A bad sign-up name left an account without a profile, which later broke cancellations and reviews          | **Fixed.** Names must be 2–60 characters, and a missing profile is recreated before it is counted (test)                                                                         |
| 8   | Editing a published listing blocked approval of its waiting requests, and approving the edit undid a pause | **Fixed.** Additive migration `outfit_resume_paused_after_review` (test)                                                                                                         |
| 9   | The price could change between the renter seeing it and requesting                                         | **Fixed.** The request carries the quoted price and deposit; a mismatch is refused with `PRICE_CHANGED` (tests, including a component test)                                      |
| 10  | Hiding a category froze the listings already in it                                                         | **Fixed.** Listings already in a hidden category may stay in it (test)                                                                                                           |
| 11  | The dispute decision form failed by default when there was a late fee                                      | **Fixed.** Amounts in rupees with paise (test)                                                                                                                                   |
| 12  | The completion notice promised a deposit refund even when the deposit was withheld                         | **Fixed.** The wording no longer promises an amount (test)                                                                                                                       |
| 13  | The payout UPI ID could be changed silently                                                                | **Fixed.** Audited, announced to the account holder, rate limited (test)                                                                                                         |
| 14  | An address could be removed while a listing still shared it with renters                                   | **Fixed.** Refused with `ADDRESS_IN_USE` (test)                                                                                                                                  |
| 15  | Contact details stayed visible forever                                                                     | **Fixed.** Hidden 14 days after completion (test)                                                                                                                                |
| 16  | Suspending a member left the other side of open bookings uninformed                                        | **Fixed.** The other side is notified and the audit lists the bookings (test). Bookings are deliberately not cancelled automatically: money decisions stay with an administrator |
| 17  | Terms acceptance at sign-up was checked only in the browser                                                | **Fixed.** Required by the server and recorded with its version. Additive migration `signup_terms_acceptance` (`auth-hardening.test.ts`)                                         |

### Low

| #     | Finding                                                                                             | Outcome                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18    | Two photograph removals at once could leave a listing below its minimum                             | **Fixed.** Counted under the outfit's row lock (test; mutation-checked)                                                                                                                         |
| 19    | Uploads at once could exceed eight photographs                                                      | **Fixed.** Same lock (test; mutation-checked)                                                                                                                                                   |
| 20    | The five-address cap could be exceeded, and two first addresses crashed on the single-default index | **Fixed.** User row lock (test)                                                                                                                                                                 |
| 21    | Several write actions had no rate limit                                                             | **Fixed.** Profile, addresses, listing edit, calendar block and UPI changes are limited. `tests/unit/app/action-limits.test.ts` fails when a new action has neither a limit nor a stated reason |
| 22    | A late fee could be contested when none was charged                                                 | **Fixed.** Refused with `NO_LATE_FEE`, and the option is hidden (integration and component tests)                                                                                               |
| 23    | Pages displayed any error text given in the address bar                                             | **Fixed.** The message is HMAC-signed and shown only when the signature verifies (`tests/unit/shared/flash.test.ts`)                                                                            |
| 24    | A malformed id in the address gave a 500                                                            | **Fixed.** Now a 404 (test)                                                                                                                                                                     |
| 25    | Photographs of drafts, rejected and suspended listings were public                                  | **Fixed.** They are served only to the owner, administrators and renters who booked the outfit. The same applies to the listings of a suspended member (test)                                   |
| 26    | Replaced or failed condition-report photographs are never deleted from storage                      | **Open, documented.** Low risk: the files are private and unreferenced. Fixing it needs a storage clean-up job, which is out of POC scope                                                       |
| 27–29 | No notification for a paid payout, a new dispute message or a reinstated listing                    | **Fixed** (test)                                                                                                                                                                                |
| 30    | The request page promised "24 hours"                                                                | **Fixed.** It states the real rule, and the booking page shows the exact deadline                                                                                                               |
| 31    | Cancel was offered after cancelling had become impossible                                           | **Fixed** (`tests/component/booking-view.test.tsx`; mutation-checked)                                                                                                                           |
| 32    | The owner calendar use case had no authorisation of its own                                         | **Fixed** (test)                                                                                                                                                                                |
| 33    | Saving accepted any outfit id, and a double click failed                                            | **Fixed.** Only published outfits can be saved, and saving and removing are idempotent (test)                                                                                                   |
| 34    | Dead code                                                                                           | **Removed:** `isTerminal`, `PRIVATE_PREFIXES`, `phoneSchema`, `countAddresses`. The duplicated open-status list now reuses `OPEN_STATUSES`                                                      |
| 35    | An administrator could moderate their own listing                                                   | **Fixed.** Refused (test)                                                                                                                                                                       |
| 36    | Names in emails had no length limit                                                                 | **Fixed** together with #7                                                                                                                                                                      |

### Found while verifying

- **Loading placeholders broke 404s.** Under a loading boundary Next.js streams the response with status
  200, so a stranger opening someone else's booking received the not-found page with status 200. The
  placeholders were kept only on pages that never return not-found (Explore, My outfits), and an
  end-to-end test checks the 404.
- **Colour contrast.** axe found brass numerals on the dark home-page section at about 2.8:1. A lighter
  brass token fixes it (about 4.8:1).

## 5. Making the POC demonstrable

- **Ready-made bookings (`pnpm db:seed:bookings`).** One booking for each of these stages: paid and starting
  today; handed over and due back today; returned yesterday; awaiting payment; completed. Each is made
  through the real use cases and a simulated payment. The script refuses to run outside `local` and
  `test`, and a booking that a demo has moved on is replaced when the script is run again.
- **Three photographs for every seeded listing.** The two extra photographs are crops of each garment's
  own picture, and their alt text says so. Existing local databases are backfilled.
- **Local tools page (`/dev`)** with **Run background jobs now**. This runs the same sweep a scheduler
  would: expiries, completion, refunds to the sandbox, and emails to the outbox.
- **Simulation is always labelled:**
  - a banner on every local page links to Tools and the Outbox;
  - the pay button reads "Pay ₹… (simulated)";
  - the sandbox checkout uses plain-language outcomes and no longer claims Razorpay test mode;
  - the sign-up, password-reset and account pages point to the Outbox;
  - payout pages say no money moves.
- **Clearer pages:**
  - specific success notices instead of "Done", and notices for a sent request and a declined payment;
  - plain words instead of stored codes (closed reasons, dispute kinds, refund and payout states);
  - branded not-found and error pages that show no internal detail;
  - consistent names: Published, Pending approval, My rentals, Rental requests, Past rentals;
  - the admin "Refunds failed" figure links to its list;
  - the local sign-in page lists the seeded accounts, including the administrator.
- **Public demo, read-only showcase (code only, not deployed):**
  - visitors can no longer remove seeded photographs;
  - edits that would send a published listing back to a review that never comes are refused;
  - condition reports are refused before anything is stored;
  - every owner is named on the sign-in page;
  - the sign-up and password-reset links are hidden.

## 6. Journeys verified

All ten were verified locally against a production build by the end-to-end suite (20 tests, Chromium; the
sign-up journey also on a phone-sized screen).

| #   | Journey                                  | Verified by                                                                            |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Register and sign in                     | `auth.spec.ts`: sign-up, email link, mobile code, sign out and back in; password reset |
| 2   | Create a listing with photographs        | `marketplace.spec.ts` Journey A (held back at two photographs, continues at three)     |
| 3   | Moderation and approval                  | `poc-journeys.spec.ts`: hidden from Explore until an administrator approves it         |
| 4   | Browse as another user                   | `marketplace.spec.ts` Journey B                                                        |
| 5   | Check availability and request           | `marketplace.spec.ts` Journey B, `booking.spec.ts`                                     |
| 6   | Simulated payment                        | `booking.spec.ts`, `poc-journeys.spec.ts`                                              |
| 7   | Booking, handover and return             | `poc-journeys.spec.ts`: handover with photographs, confirmation, return, completion    |
| 8   | Cancellation, payment failure and refund | `poc-journeys.spec.ts`: declined, paid, cancelled, refund sent by the background jobs  |
| 9   | Manage listings, bookings and account    | `poc-journeys.spec.ts`: every account and owner page opens; Journey A (My outfits)     |
| 10  | Administration                           | `poc-journeys.spec.ts`: every admin page opens; approval; non-administrators get 404   |

The step-by-step script for showing them by hand is the [POC demo guide](../development/poc-demo-guide.md).
Journeys 9 and 10 are checked by automation for every page opening without an error. Not every action on
those pages has its own end-to-end test; the underlying use cases are covered by the integration tests.

## 7. Phase status

| Phase                       | Status after this work                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MVP                         | Complete. The gaps the defect hunt found are closed                                                         |
| Phase 1 (security)          | Complete. Three of its open low findings (L2 error text, L4 rate limits, L7 handover version) are now fixed |
| Phase 2 (payments)          | Complete in code and against the sandbox. Real-provider verification is still 0% (§8)                       |
| Phase 3 (marketplace)       | Complete. Its listed limitation, the three-photograph minimum, is done                                      |
| POC hardening (this report) | Complete, apart from the items in §8                                                                        |

## 8. Still simulated, unverified or open

**Simulated (by design, and labelled):**

- payments and refunds (the sandbox provider);
- emails and SMS codes (the dev outbox);
- owner payouts (recorded by an administrator; nothing is sent);
- background jobs on demand.

**Never run against the real service:**

- Razorpay (not even in test mode);
- MSG91 SMS;
- SMTP email;
- S3-compatible storage.

The code paths exist and are unit-tested against stubs only. No claim is made that they work.

**Not built:** identity verification (a status that is always "not verified"), automated payout
settlement, tax handling.

**Open items:**

- **#26:** orphaned condition-report photographs in storage.
- **Suspending a member** does not cancel their open bookings. This is by design: an administrator decides.
- **The public demo is not updated.** Deploying this work needs:
  1. the two additive migrations applied to the demo database;
  2. the demo photographs regenerated (the seed now gives each listing three);
  3. a deploy.

  None of this was done without approval.

- **Clicking the chosen start day again clears it** in the date picker. This is harmless, but a renter may
  not expect it.
- **Running the end-to-end suite back to back** on one long-lived local database eventually trips the real
  rate limits. These are 10 booking requests per renter per hour, and 10 phone-code checks per IP per 5
  minutes, and they are behaving correctly. CI starts from a fresh database. During this work the local
  counters were cleared once in the local development database; no other database was touched.

## 9. Documentation updated

- **README:**
  - the status no longer claims Razorpay test mode;
  - the SMS and identity limitations are accurate;
  - the features table is current;
  - links to the demo guide and to this report.
- **Deployment guide:** the status is accurate about Razorpay, SMS and what production refuses.
- **Security architecture:** L2, L4 and L7 are fixed, plus a pointer to this report.
- **System architecture and CLAUDE.md:** identity verification is a status, not a port.
- **Product requirements:**
  - the routes match the app;
  - consent is recorded at sign-up;
  - security reviews live in `security-architecture.md` and `docs/audits/`.
- **New:** [POC demo guide](../development/poc-demo-guide.md) and this report.

With these, every discrepancy in §9 of the progress report is resolved. Items 5, 10 and 11, and the
sign-up half of 6, were resolved in code (the photograph minimum, axe in the test run, the missing
notifications, recorded terms acceptance).

## 10. Next steps toward production

1. **Decide the money model with a lawyer** (RBI payment-aggregator rules) and a chartered accountant (GST,
   TCS, TDS). This blocks real transactions.
2. **Run the real integrations in test mode** and record the results:
   - Razorpay (the checklist in the deployment guide);
   - MSG91 after DLT registration;
   - SMTP;
   - S3 or R2 storage.
3. **Update the public demo** after approval (§8), then re-run the end-to-end suite against it with
   `E2E_BASE_URL`.
4. **Production operations:**
   - hosting with object storage;
   - a 5-minute scheduler for the sweep;
   - uptime monitors on the health and money-health endpoints;
   - error tracking;
   - a tested restore.
5. **Close the remaining gaps:**
   - storage clean-up (#26);
   - account deletion and data export (DPDP);
   - manual keyboard and screen-reader checks of the key journeys before launch.
