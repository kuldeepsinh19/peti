# Peti — Phase 1 remediation report (production hardening)

|                        |                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Date                   | 2026-11-15                                                                                                                |
| Scope                  | Phase 1 of the roadmap in [MVP-AUDIT-REPORT.md](MVP-AUDIT-REPORT.md): make Peti safe to invite real users. Security only. |
| Starting commit        | `1b386b0` (audit report)                                                                                                  |
| Final code commit      | `e5b4a9e` (CI green on all three jobs)                                                                                    |
| Decisions by the owner | Turn the public demo into a locked demo mode. Leave terms-acceptance recording (a legal item) for later.                  |

**Bottom line: Peti is still NOT production-ready.**

The security findings in scope are fixed, each with a regression test, and the public demo is locked down. The launch blockers that need outside services or people are untouched:

- an SMS provider;
- live payments;
- a legal review;
- production hosting and monitoring.

They are listed in §6.

**Evidence tags:**

- **[TEST]** a passing automated test;
- **[RUN]** observed on a running server: the local production build or the live demo at `https://peti-kappa.vercel.app`.

---

## 1. Findings, root causes and fixes

### S-02 — rate-limit bypass through spoofed forwarded headers (High) — **Fixed**

**Root cause.**

- A route handler cannot see the TCP peer address, so Better Auth reads the client IP from headers.
- `better-auth.ts` defaulted `ipAddressHeaders` to `x-forwarded-for`.
- Better Auth's `getIPFromHeader` (`@better-auth/core/dist/utils/ip.mjs`) trusts any single-value header when no `trustedProxies` are set.
- Every auth limit was keyed only on that IP. Where no proxy overwrote the header, a client rotating it got unlimited attempts.
- Reproduced in the audit: after a 429, three requests with new spoofed addresses got 401 instead of 429.

**Fix** (commits `4c76511`, `12ccc69`):

1. **Per-account limits that ignore the address.**
   - `src/modules/auth/application/attempt-limits.ts` maps an auth request to limits:
     - sign-in: 20 per 15 minutes per email (case-insensitive);
     - password-reset request: 5 per hour per email;
     - one-time code: 5 per hour per phone number and per user.
   - Better Auth's `hooks.before` consumes them through the app's existing Postgres limiter (`postgresRateLimiter`) and answers 429.
   - **Sending a code now requires a signed-in user**, as verifying one already did, so anonymous requests cannot flood a phone number once a real SMS provider exists.
2. **No trusted forwarded header by default outside local and test.** `src/config/env.ts` refuses to start unless:
   - `AUTH_IP_HEADERS` names the header the proxy sets;
   - `x-forwarded-for` is configured together with `AUTH_TRUSTED_PROXIES`;
   - every trusted proxy is a valid IP or CIDR range.

   The `x-forwarded-for` fallback remains only in local and test. A request without the configured header shares one bucket with all other such requests, so limits fail closed rather than open.

**Regression tests:**

- `tests/integration/auth/auth-hardening.test.ts` "cannot be escaped by rotating X-Forwarded-For". It runs Better Auth's real handler in-process against PostgreSQL: 21 wrong sign-ins for one email, each from a new spoofed address; the 21st is 429 and another account is unaffected. A **mutation check** proved it: with the per-account limit removed, the test fails [TEST].
- "sending a one-time code requires a signed-in user" [TEST].
- `tests/unit/auth/attempt-limits.test.ts` (5 tests) [TEST].
- `tests/unit/config/env.test.ts`, "client address trust" (4 tests) [TEST].

**Re-test** [RUN, local production build]: 22 wrong sign-ins for one email from 22 spoofed addresses → `401 ×20, 429, 429`.

### S-05 — Better Auth admin endpoints bypassed the audit log (High) — **Fixed**

**Root cause.** The `admin()` plugin mounts 15 endpoints:

- `impersonate-user`, `set-role`, `set-user-password`, `ban-user`, `remove-user`, `list-users` and more.

The app calls none of them; it uses the plugin only for the role and ban fields and for ban enforcement. Any administrator, or a stolen admin session, could use them with no audit entry. `change-email`, `change-password`, `update-user` and `delete-user` were also reachable, with no UI behind them.

**Fix** (`387f0c1`):

- All 19 endpoints are in `DISABLED_PATHS`, alongside the phone endpoints disabled earlier.
- The unused `adminClient()` browser plugin is removed.

**Regression test:** "endpoints the product does not use … answer 404 whatever the method". It pins 12 dangerous paths **independently of the config list**. Mutation check: re-enabling `/admin/set-role` fails the test [TEST].

**Re-test:** `impersonate-user`, `set-role`, `set-user-password`, `list-users`, `change-password`, `change-email`, `update-user`, `sign-in/phone-number` and `phone-number/request-password-reset` all → 404 [RUN local]. `admin/list-users`, `admin/impersonate-user` and `change-password` → 404 [RUN live].

### Public demo: developer inbox exposure and account takeover (Critical for the demo) — **Fixed**

**Root cause.** One switch, `isDevToolingEnabled`, gated three unrelated capabilities:

- the sandbox payment provider;
- the developer outbox, which shows every email and one-time code;
- 20× looser auth limits.

The demo needed only the first, so it ran `APP_ENV=test` and got all three. Anyone could request a password reset for a demo account and read the link at `/dev/outbox` [RUN in the audit].

**Fix** (`1bc2b91`): an explicit `APP_ENV=demo` with the capabilities split in `src/config/env.ts`:

| Capability                                                                    | local / test | demo   | staging / production |
| ----------------------------------------------------------------------------- | ------------ | ------ | -------------------- |
| Developer tooling (dev outbox, design system)                                 | yes          | **no** | no                   |
| Sandbox payments and checkout                                                 | yes          | yes    | no                   |
| Self-service accounts (sign-up, password reset, email and phone verification) | yes          | **no** | yes                  |
| Auth limits ×20                                                               | test only    | no     | no                   |

**Enforced in layers:**

- `src/proxy.ts` uses the pure `devRouteAllowed`;
- the `/dev` layout checks both capabilities, and the outbox and design-system pages each check developer tooling themselves;
- Better Auth disables `DEMO_DISABLED_PATHS` in the demo;
- sign-up, forgot-password and reset-password pages show a demonstration notice instead of the form;
- the sign-in page lists the shared demo accounts;
- every page shows a demonstration banner;
- HSTS is sent;
- the demo refuses to start without `CRON_SECRET`, `AUTH_IP_HEADERS` and non-placeholder sandbox secrets.

**Regression tests:**

- env unit tests "public demo (APP_ENV=demo)" (5 tests) [TEST];
- integration "refuses sign-up, password reset and phone verification, so shared accounts cannot be taken over" (no user or outbox row is created) and "still lets the shared demo accounts sign in" [TEST].

**Demo data clean-up** [RUN, live demo database, read before writing]:

- 5 users, all seeded; **no account beyond the seeded ones** ever existed;
- all 5 demo passwords still matched the seeded value (checked with `verifyPassword`), so **no takeover had happened** and no reset was needed;
- deleted 20 captured emails (booking notifications), 17 sessions and 0 verification tokens;
- after the clean-up: outbox 0, sessions 0, verifications 0.

**Re-test** [RUN live, after setting `APP_ENV=demo` and redeploying]:

- `/dev/outbox` → 404 and `/dev/design-system` → 404;
- POST `sign-up/email`, `request-password-reset`, `reset-password` and `phone-number/send-otp` → 404;
- banner and sign-up notice present;
- HSTS `max-age=31536000; includeSubDomains`;
- 12 wrong sign-ins → `401 ×10, 429, 429` (normal limits);
- rotating `X-Forwarded-For` for the same account → 429 (Vercel's `x-real-ip` is what counts).

The booking journey with a sandbox payment passed against a local demo-mode server [RUN]. The live run is in §7.

### S-12 — payout marked paid without a valid UPI ID (High) — **Fixed**

**Root cause.**

- `markPayoutPaid` checked only that the payout was `PENDING`.
- `findPayout` never loaded the owner's payout account.
- The payouts page offered "Mark paid" next to "Not provided".

**Fix** (`bbbaecc`):

- The UPI pattern is exported once as `UPI_VPA` from the users module.
- The use case refuses with `NO_PAYOUT_ACCOUNT` unless the owner's UPI ID exists and matches.
- The repository's `updateMany` also requires the account at write time.
- The audit entry records the UPI ID the money went to.
- The page says "Waiting for the owner's UPI ID" instead of showing the form.
- The error code is documented in `docs/api/error-handling.md`.

**Regression tests** (`tests/integration/security/phase-1-fixes.test.ts`):

- refused without an account: the payout stays `PENDING` with no reference and no audit row;
- refused for a malformed stored ID;
- succeeds after the owner saves one, and the audit entry records `owner.one@okbank`.

All [TEST].

### Authentication, authorisation and sensitive-data review (item 5) — **No new holes found**

The two earlier code reviews, the audit's 144-view role crawl and today's probes found the checks sound. The audit had listed two areas as untested; they now have tests (`114c260`, no code change):

- condition-report photos are visible to the owner, the renter and administrators only; a stranger and unknown keys are refused [TEST];
- another user can neither remove nor make default someone's address [TEST].

Still behaving correctly [RUN local and live]:

- cross-origin sign-in → 403 `INVALID_ORIGIN`;
- anonymous one-time code request → 403;
- real sign-in → 200.

---

## 2. Files changed

| Area              | Files                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth              | `src/modules/auth/application/attempt-limits.ts` (new), `src/modules/auth/infrastructure/better-auth.ts`, `src/modules/auth/ui/auth-client.ts`                                                                                  |
| Config and wiring | `src/config/env.ts`, `src/config/site.ts`, `src/composition/container.ts`, `src/proxy.ts`, `next.config.ts`, `.env.example`                                                                                                     |
| Demo UI           | `src/app/(auth)/demo-notice.tsx` (new), sign-in, sign-up, forgot- and reset-password pages, `src/app/layout.tsx`, `src/app/dev/*`                                                                                               |
| Payouts           | `src/modules/users/application/contracts.ts`, `src/modules/admin/application/admin.ts`, `src/modules/admin/infrastructure/prisma-admin-repository.ts`, `src/app/admin/payouts/page.tsx`                                         |
| Tests             | `tests/unit/auth/attempt-limits.test.ts`, `tests/unit/config/env.test.ts`, `tests/integration/auth/auth-hardening.test.ts`, `tests/integration/security/phase-1-fixes.test.ts`, `tests/integration/trust/reviews-admin.test.ts` |
| Docs              | `CLAUDE.md`, `docs/development/deployment-guide.md`, `docs/architecture/security-architecture.md`, `docs/api/error-handling.md`                                                                                                 |

**Not changed:** no new dependencies, no database migrations, no changes to booking or payment logic.

---

## 3. Test evidence (2026-11-15)

| Check                               | Result                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, layer rules            | Pass; 0 violations, 242 modules                                                                                                                                                                         |
| Unit + component                    | **100 / 100** (was 86): +14 for env, demo and attempt limits                                                                                                                                            |
| Integration (PostgreSQL 18)         | **79 / 79** (was 69): +5 auth hardening, +5 Phase 1 security                                                                                                                                            |
| Schema drift                        | None                                                                                                                                                                                                    |
| Production build                    | Pass                                                                                                                                                                                                    |
| End to end (local)                  | **11 / 11**                                                                                                                                                                                             |
| CI on `e5b4a9e`                     | Pass: quality, integration, end to end                                                                                                                                                                  |
| Mutation checks                     | Per-account limit removed → the bypass test fails; `/admin/set-role` re-enabled → the disabled-endpoint test fails                                                                                      |
| Database integrity, local and live  | 0 hold-invariant violations; 0 reconciliation imbalances; all 5 migrations applied. Neither database has a closed, paid booking yet, so live reconciliation has no rows; the integration tests cover it |
| Live booking journey after redeploy | See §7                                                                                                                                                                                                  |

**One environment note.** On a local server with no proxy, no request carries `x-real-ip`. Every browser therefore shares one sign-in bucket, and repeated local e2e runs in demo mode get "Too many attempts". That is the intended fail-closed behaviour. On Vercel each visitor has their own `x-real-ip`.

---

## 4. Residual risks introduced or accepted by these fixes

| Risk                                                                                                      | Severity              | Note                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Per-account limits let someone lock an account out of sign-in for up to 15 minutes by failing 20 times    | Low                   | Standard trade-off; the user can wait or reset their password (outside the demo). Watch for abuse once real users exist |
| Demo accounts' password is public: anyone can edit their profile text, listings and bookings (defacement) | Low (fictional data)  | No takeover or lock-out is possible. Re-seed if defaced                                                                 |
| Demo notification emails are still stored (`MAIL_DRIVER=outbox`), but never shown                         | Low                   | No page shows them in demo mode; purge periodically                                                                     |
| A misconfigured proxy header means everyone shares one auth bucket                                        | Medium (availability) | Fails closed by design; the start-up validation makes the setting explicit                                              |

---

## 5. Still open from the audit (out of Phase 1 scope)

| ID   | Severity | Item                                                                                 | Planned phase  |
| ---- | -------- | ------------------------------------------------------------------------------------ | -------------- |
| S-04 | High     | Unexpected or duplicate captures are flagged, but the refund is manual               | B (real money) |
| S-06 | Medium   | `refund.processed` webhook not matched when it arrives before the provider refund id | B              |
| S-07 | Medium   | `?error=` message text can be crafted (no XSS)                                       | D              |
| S-08 | Medium   | No site-wide Content-Security-Policy                                                 | A/D            |
| S-09 | Medium   | Handover report replaceable until acknowledged                                       | C              |
| S-10 | Low      | 14-day sessions, no idle timeout                                                     | D              |
| —    | Medium   | Admin action and its audit row are not atomic                                        | D              |

---

## 6. Remaining launch blockers (why this is not production-ready)

1. **SMS provider.** None exists, so production deliberately refuses to start (`SMS_DRIVER=outbox` is rejected). Phone verification, needed to book or list, is impossible without a real provider and DLT registration. No fake SMS was added.
2. **Real payments and payouts.**
   - Razorpay test keys only; the adapter has never been run against Razorpay.
   - No live-mode review, automatic capture setting, split settlement (Route) or KYC.
   - No GST or TDS handling.
3. **Legal.**
   - The terms and privacy notice are unreviewed drafts.
   - Acceptance at sign-up is still not recorded. The owner deferred this from Phase 1.
4. **Production hosting and operations.**
   - `APP_ENV=production` hosting with S3/R2 storage;
   - a scheduler every few minutes (the free Vercel plan allows one run a day);
   - error tracking and alerting;
   - backups with tested restores;
   - `AUTH_IP_HEADERS` and `AUTH_TRUSTED_PROXIES` set for the real host (now enforced at start-up).
5. **The open findings in §5,** especially S-04 before any real money moves.

Peti can be shown safely as a **demonstration with fictional data**. It must not be used with real users or real money until the five items above are resolved.

---

## 7. Live verification after redeploy

The live booking journey was **not completed** after the redeploy:

| Attempt                                        | Outcome                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run 1, against `https://peti-kappa.vercel.app` | Sign-in answered "Too many attempts. Please wait a minute and try again." My own probes a minute earlier (15 wrong sign-ins from the same address) had used up the 10-per-minute allowance. This is the new limit working as intended, not a defect. |
| Run 2, after the window                        | **Stopped by the tooling** because the machine ran critically low on memory. It is unrelated to the app and was deliberately not restarted.                                                                                                          |

**What is verified:**

- Against the live demo: every route and endpoint check in §1 [RUN].
- Against a local server in `APP_ENV=demo`: the same booking journey (sign-in → request → owner approval → sandbox payment → confirmation) **passed** [RUN].

**To finish the live check**, from the repository root, at least a minute after any other sign-in attempts:

```bash
E2E_BASE_URL=https://peti-kappa.vercel.app pnpm exec playwright test tests/e2e/booking.spec.ts --project=desktop
```
