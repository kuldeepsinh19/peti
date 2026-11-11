# Product requirements — Peti MVP

Status: draft for the MVP build. Date: 2026-11-11. Launch city: Ahmedabad. Currency: INR. Timezone:
Asia/Kolkata (IST) for every date, deadline and "today".

Related documents:

- [User personas](./user-personas.md) — hypothetical archetypes, not research findings
- [User journeys](./user-journeys.md) — step-by-step flows, including unhappy paths
- [Business model](./business-model.md) — who pays what, commission mechanics
- [Assumptions and risks](./assumptions-and-risks.md) — what we believe, why, and what could go wrong
- [Competitor research](./competitor-research.md) — sources for every market claim (VF / MC / NF tags)
- [Booking lifecycle](../architecture/booking-lifecycle.md) and
  [payment architecture](../architecture/payment-architecture.md) — the technical source of truth for states,
  transitions and money

Policy numbers in this document (windows, tiers, percentages) are **product defaults chosen for the MVP**.
They are assumptions to be validated, not legal advice and not findings from user research.

---

## 1. Problem

People in Ahmedabad own expensive occasionwear — bridal and party lehengas, chaniya cholis, sarees,
sherwanis, Jodhpuri suits — that is worn a handful of times. Other people need exactly those garments for a
few days around a wedding function or Navratri and do not want to buy them.

Local peer-to-peer options exist, but the two direct competitors we found, Anokhi Reet and WEVTRA, are
classifieds-style apps: renter and owner chat, then settle payment, deposit, damage and refunds between
themselves, off the platform. Anokhi Reet's own terms say it "does not mediate disputes" (VF, see
[competitor research §1](./competitor-research.md#1-anokhi-reet-anokhireetin--direct-local-competitor)).
That leaves both sides carrying the risk:

- **Owners** hand a garment worth many times the rent to a stranger, with only a privately agreed deposit and
  no shared record of the garment's condition.
- **Renters** pay a deposit to a stranger by UPI or cash, with no guarantee of getting it back and no neutral
  party if the owner claims damage.
- **Both** spend time in chat agreeing dates, prices, deposits and what counts as damage, for every rental.

The one Indian P2P platform we found that takes payment on-platform, SWRL, focuses on designer and western
wear rather than Gujarati occasionwear. The large managed player, Flyrobe, is now mostly owned inventory, and
its post-acquisition complaints show how owner trust is lost when a platform holds owners' garments or money
and the business changes (unverified individual complaints, see
[competitor research §6](./competitor-research.md#6-flyrobe--rent-it-bae--history)).

## 2. Product summary

Peti is a pure customer-to-customer (C2C) rental marketplace for premium occasionwear in Ahmedabad.

- Individuals list garments they own. **Peti never owns inventory and never takes custody of a garment.**
- Owners set a price for each duration they offer (any of 2, 3, 5 or 7 days) and a refundable security
  deposit, and approve or reject each request. There is no instant book.
- Renters pay the rental fee plus the deposit **on-platform**. A booking is CONFIRMED only after a verified
  payment confirmation from the payment provider.
- Handover and return happen **in person in Ahmedabad**. Each is recorded with a condition report with photos.
- After return there is a **48-hour inspection window**. The deposit is then refunded (fully or partly), or a
  dispute is opened and an admin resolves it.
- Both sides can leave a **verified, double-blind review** after completion.
- Any user can be both an owner and a renter.
- Peti earns a **15% commission on the rental fee, charged to the owner side only** (a launch assumption; see
  [business model](./business-model.md)). Payouts to owners are recorded and marked paid manually by an admin
  in the MVP; no money moves automatically to owners.

The differentiation is a hypothesis, not a validated finding: Peti is the **transaction layer** the local
classifieds lack (hypotheses H1, H2, H3 and H5 in
[competitor research](./competitor-research.md#differentiation-hypotheses-not-validated)).

## 3. Goals and non-goals

### Goals

| ID  | Goal                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| G-1 | A renter can find, request, pay for, collect, return and review a garment without any off-platform money changing hands. |
| G-2 | An owner can list a garment, control who rents it and when, and see exactly what they will earn from each booking.       |
| G-3 | A garment can never be confirmed for two overlapping rentals (enforced by the database, not only the UI).                |
| G-4 | Every rupee received is accounted for per booking: refund + owner payout + commission = amount captured.                 |
| G-5 | Damage and non-return disagreements follow one fixed, time-boxed process with photo evidence and an admin decision.      |
| G-6 | The product says plainly what is and is not verified about a user, and never overstates it.                              |
| G-7 | The codebase is open source, production-minded and documented well enough for others to run and extend.                  |

### Non-goals for the MVP

| Non-goal                                         | Why                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Platform logistics (delivery, pickup, couriers)  | Lean cost base; in-person handover within one city (H5).                                        |
| In-app chat                                      | Fixed date and price rules replace negotiation (H2); contact details are revealed on CONFIRMED. |
| Insurance or a damage-protection product         | Needs a partner and regulatory work; the deposit is the recoverable cap.                        |
| Vendor or boutique listings                      | Pure C2C; vendors change trust, tax and moderation needs.                                       |
| Owner subscriptions or listing fees              | Commission on completed rentals only.                                                           |
| Instant book                                     | Owners approve every request.                                                                   |
| Counter-offers or price negotiation              | Owner-set prices per duration option.                                                           |
| Automated payouts to owners                      | Needs the provider's marketplace product and legal/tax advice; admins mark payouts paid.        |
| Identity verification (KYC, Aadhaar, ID uploads) | Only an abstraction exists; every user stays UNVERIFIED. No ID documents are collected.         |
| Multi-city operations                            | City is data; operations, moderation and seeding cover Ahmedabad only.                          |
| Native mobile apps                               | Responsive web first.                                                                           |

## 4. Success measures

We have no baseline data, so **no targets are set here**. These are the things we would measure from the
first booking onwards; targets come after we have real data. Each can be computed from data the MVP already
stores (booking status history, payments, refunds, disputes, reviews).

| Area           | What we would measure                                                                                     | Tests which assumption                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Supply         | Listings submitted, approved and rejected per week; time from submission to moderation decision           | Cold-start supply ([A-07](./assumptions-and-risks.md#assumptions-register)) |
| Supply         | Share of approved listings that receive at least one request; that complete at least one rental           | Owner demand for income                                                     |
| Demand         | Searches with a date filter; outfit detail views; saved outfits per active renter                         | Demand for rentals in Ahmedabad                                             |
| Conversion     | Requests → approved → paid → completed, as a funnel by category and duration                              | H1, H2                                                                      |
| Owner response | Time from request to owner decision; share of requests that EXPIRE without a decision                     | 24-hour response window is workable                                         |
| Payment        | Share of approved bookings that EXPIRE unpaid; late captures auto-refunded                                | 12-hour payment window is workable                                          |
| Cancellations  | Renter cancellations by tier; owner cancellations per owner                                               | Cancellation tiers are accepted                                             |
| Handover       | Bookings disputed at handover ("not as described", "handover failed")                                     | Fit and description risk                                                    |
| Return         | Late returns and late days per rental; overdue rentals escalated by the system                            | Late-fee policy                                                             |
| Disputes       | Dispute rate per completed rental; share accepted / withdrawn / admin-resolved; time to resolution        | H3, damage process                                                          |
| Deposit        | Time from return recorded to deposit refund dispatched; refund failures and retries                       | Deposit trust                                                               |
| Trust          | Review submission rate; share of users with a verified phone                                              | Reviews are valued                                                          |
| Retention      | Renters and owners with a second completed rental; users who are both owner and renter                    | Repeat behaviour                                                            |
| Money          | Commission recognised; payouts outstanding vs marked paid; reconciliation imbalance (must always be zero) | G-4                                                                         |
| Seasonality    | All of the above by month, especially Navratri and November–February                                      | H6                                                                          |

## 5. Key domain rules (summary)

The full rules are in [booking lifecycle](../architecture/booking-lifecycle.md) and
[payment architecture](../architecture/payment-architecture.md). This is the product-level summary.

### Booking states

| State              | Meaning for users                                                                                              | Calendar held? |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | -------------- |
| `PENDING_APPROVAL` | Renter has requested; owner has not decided.                                                                   | No             |
| `AWAITING_PAYMENT` | Owner approved; renter must pay within the payment window.                                                     | Yes            |
| `CONFIRMED`        | Payment verified by the provider; contact details revealed; "ready for pickup" label near the start date.      | Yes            |
| `ACTIVE`           | Owner recorded the handover report; renter acknowledged it. "Return due/overdue" is derived from the end date. | Yes            |
| `RETURNED`         | Owner recorded the return report; 48-hour inspection window running.                                           | Yes            |
| `DISPUTED`         | A dispute is open; an admin or the parties must resolve it.                                                    | Yes            |
| `COMPLETED`        | Settled: deposit refunded or withheld as decided, owner payout recorded. Terminal.                             | Yes (history)  |
| `CANCELLED`        | Withdrawn or cancelled by a participant or admin. Terminal.                                                    | No             |
| `REJECTED`         | Owner (or the system, for overlaps) declined. Terminal.                                                        | No             |
| `EXPIRED`          | Owner did not respond, or renter did not pay, in time. Terminal.                                               | No             |

A calendar hold is taken **at approval** and covers the rental days plus the outfit's turnaround buffer.
Example: a 3-day rental from 10 to 12 December with a 1-day buffer holds 10–13 December; the outfit is next
available on 14 December.

### Policy defaults

| Topic                       | Default (product assumption)                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Duration options            | Owner prices any of 2, 3, 5, 7 days; a booking uses exactly one of them                                            |
| Booking start date          | From tomorrow (IST) up to 180 days ahead                                                                           |
| Owner response window       | 24 hours, or 18:00 IST on the day before the start, whichever is earlier                                           |
| Payment window              | 12 hours after approval, capped at 12 hours before the start                                                       |
| Commission                  | 15% of the rental fee, owner side only (1,500 basis points, round half up)                                         |
| Deposit                     | Owner-set; minimum ₹500; maximum the declared retail value; the form suggests 20–30% of retail                     |
| Turnaround buffer           | 1 day by default; owner may set 0–7 days per outfit                                                                |
| Renter cancels after paying | Deposit refunded 100%; rental fee refunded 100% (7+ days before start), 50% (48 hours–7 days), 0% (under 48 hours) |
| Owner cancels after payment | Renter refunded 100%; no payout; the cancellation is counted against the owner                                     |
| Late return                 | 1.5 × daily rate per late day, taken from the deposit, capped at the deposit                                       |
| Inspection window           | 48 hours after the return is recorded; no action means automatic completion                                        |
| Damage claim                | At most the deposit minus any late fee                                                                             |
| Reviews                     | Both participants, within 14 days, hidden until both submit or the window closes                                   |
| Contact details             | Phone number and pickup address revealed to the other party only from CONFIRMED                                    |

All of these are snapshotted onto each booking at request time, so a later policy or price change never
alters an existing booking.

---

## 6. Functional requirements

Priority uses MoSCoW: **M** must have (MVP fails without it), **S** should have (in MVP unless it threatens
the timeline), **C** could have (only if cheap), **W** won't have in the MVP (listed so the boundary is
explicit). Routes are given where a requirement maps to a page; the full route list is in section 8.

### 6.1 Authentication and contact verification (AUTH)

| ID         | Requirement                                                                                                                                                                    | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-AUTH-01 | A visitor can sign up with name, email and password (`/sign-up`) and must accept the current terms and privacy notice.                                                         | M        |
| FR-AUTH-02 | A verification email is sent on sign-up; the email address is marked verified only through the emailed link (`/verify-email`).                                                 | M        |
| FR-AUTH-03 | A user can sign in and out (`/sign-in`); sessions are stored server-side and can be revoked.                                                                                   | M        |
| FR-AUTH-04 | A user can request a password reset by email (`/forgot-password`) and set a new password from a single-use, time-limited link (`/reset-password`).                             | M        |
| FR-AUTH-05 | A user can add an Indian mobile number and verify it by a one-time code sent by SMS.                                                                                           | M        |
| FR-AUTH-06 | A verified email is required before a user can request a booking or submit a listing for review.                                                                               | M        |
| FR-AUTH-07 | A verified phone number is required before a user can request a booking or submit a listing for review, because the phone number is the contact channel revealed on CONFIRMED. | S        |
| FR-AUTH-08 | Sign-in, sign-up, password reset and OTP requests are rate-limited per account and per IP address.                                                                             | M        |
| FR-AUTH-09 | In local and test environments, emails and OTPs are written to a developer outbox (`/dev/outbox`) instead of being sent; this page does not exist in production.               | M        |
| FR-AUTH-10 | Users have a role of `USER` or `ADMIN`; admin pages and actions are refused to non-admins on the server.                                                                       | M        |
| FR-AUTH-11 | Social sign-in (Google and similar).                                                                                                                                           | W        |

### 6.2 Profile, addresses and trust signals (PROF)

| ID         | Requirement                                                                                                                                                                                                                                | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-PROF-01 | A user can edit their display name, profile photo, short bio and locality (`/account/profile`).                                                                                                                                            | M        |
| FR-PROF-02 | A user can add, edit and delete addresses in Ahmedabad and mark one as default (`/account/addresses`). Owners choose a pickup address per listing.                                                                                         | M        |
| FR-PROF-03 | A public profile shows display name, locality (not the full address), member-since date, completed rentals as owner and renter, published reviews and which contact channels are verified (email, phone).                                  | M        |
| FR-PROF-04 | Every user's identity verification status is `UNVERIFIED`. The product never shows an "ID verified", "KYC verified" or similar badge, and never collects Aadhaar, PAN or any ID document.                                                  | M        |
| FR-PROF-05 | The trust and safety page (`/trust-and-safety`) states plainly what Peti verifies (email ownership, phone ownership, provider-confirmed payments, condition reports) and what it does not (identity, garment authenticity, garment value). | M        |
| FR-PROF-06 | An owner can record a UPI ID for manual payouts. Payouts cannot be marked paid without one.                                                                                                                                                | M        |
| FR-PROF-07 | A user can request deletion of their account; open bookings must be settled first, and financial and audit records are retained as required.                                                                                               | S        |
| FR-PROF-08 | A user can download a copy of their personal data.                                                                                                                                                                                         | C        |

### 6.3 Listings (LIST)

| ID         | Requirement                                                                                                                                                                                                             | Priority |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-LIST-01 | An owner can create a listing (`/lend/outfits/new`) with: title, description, category, occasion tags, size label, typed measurements, colour, fabric, condition, declared retail value, locality and pickup address.   | M        |
| FR-LIST-02 | An owner can upload at least 3 and at most a fixed maximum of photos per listing, reorder them and choose the cover photo. Uploads are checked by file content and size, re-encoded, and stripped of EXIF and GPS data. | M        |
| FR-LIST-03 | An owner sets a price for at least one of the 2, 3, 5 and 7-day duration options, and can deactivate an option.                                                                                                         | M        |
| FR-LIST-04 | An owner sets a refundable deposit between ₹500 and the declared retail value; the form suggests 20–30% of retail value and explains why.                                                                               | M        |
| FR-LIST-05 | An owner sets a turnaround buffer of 0–7 days (default 1) for cleaning between rentals.                                                                                                                                 | M        |
| FR-LIST-06 | The form shows the owner, before submitting, what they would earn for each duration option after the 15% commission.                                                                                                    | M        |
| FR-LIST-07 | A listing follows the statuses `DRAFT → PENDING_REVIEW → ACTIVE`, plus `PAUSED`, `REJECTED`, `SUSPENDED` and `ARCHIVED`. Only ACTIVE listings are discoverable or bookable.                                             | M        |
| FR-LIST-08 | An owner can save a draft, submit it for review, pause and resume an ACTIVE listing, and archive a listing (`/lend/outfits/[id]/edit`).                                                                                 | M        |
| FR-LIST-09 | Changing prices, deposit or buffer never affects existing bookings, which keep their snapshot.                                                                                                                          | M        |
| FR-LIST-10 | An owner cannot pause or archive a listing in a way that cancels CONFIRMED or ACTIVE bookings; those continue until settled.                                                                                            | M        |
| FR-LIST-11 | An owner sees all their listings with status, upcoming bookings and pending requests on the owner dashboard (`/lend`).                                                                                                  | M        |
| FR-LIST-12 | Listing-level optional fields: designer or label, year purchased, care notes, "worn N times".                                                                                                                           | C        |
| FR-LIST-13 | Vendor or boutique accounts, bulk listing upload.                                                                                                                                                                       | W        |

### 6.4 Moderation (MOD)

| ID        | Requirement                                                                                                                                                           | Priority |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-MOD-01 | An admin sees a queue of PENDING_REVIEW listings (`/admin/listings`) with photos, details, price options, deposit and owner history.                                  | M        |
| FR-MOD-02 | An admin can approve a listing (→ ACTIVE) or reject it (→ REJECTED) with a reason shown to the owner.                                                                 | M        |
| FR-MOD-03 | An owner can edit a REJECTED listing and resubmit it.                                                                                                                 | M        |
| FR-MOD-04 | An admin can suspend an ACTIVE listing (→ SUSPENDED) with a reason; suspended listings are hidden. Existing confirmed bookings are handled by the admin case by case. | M        |
| FR-MOD-05 | An admin can suspend a user (`/admin/users`); a suspended user cannot sign in to transact, and their listings are hidden.                                             | M        |
| FR-MOD-06 | An admin can manage categories (`/admin/categories`): create, rename, reorder, set the slug and cover image, and hide a category.                                     | M        |
| FR-MOD-07 | Every moderation action is written to the append-only audit log with the admin, time, target and reason.                                                              | M        |
| FR-MOD-08 | Users can report a listing or a user for review by an admin.                                                                                                          | S        |

### 6.5 Discovery (DISC)

| ID         | Requirement                                                                                                                                                                                                                                | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-DISC-01 | The landing page (`/`) offers a date-and-occasion discovery strip and "browse by occasion" (for example mehendi, haldi, sangeet, wedding, reception).                                                                                      | M        |
| FR-DISC-02 | Explore (`/explore`) lists ACTIVE outfits with filters for keyword, category, price range, size, measurements, locality and available dates.                                                                                               | M        |
| FR-DISC-03 | The date filter excludes outfits whose calendar holds (bookings and owner blocks, including buffers) overlap the requested dates.                                                                                                          | M        |
| FR-DISC-04 | Results can be sorted by newest and by price.                                                                                                                                                                                              | M        |
| FR-DISC-05 | Category pages (`/categories/[slug]`) show the outfits in one category with the same filters.                                                                                                                                              | M        |
| FR-DISC-06 | The outfit detail page (`/outfits/[slug]`) shows photos, description, measurements, condition, locality, price per duration option, deposit, turnaround buffer, owner's public profile, reviews of the owner and an availability calendar. | M        |
| FR-DISC-07 | The outfit detail page never shows the owner's phone number or address.                                                                                                                                                                    | M        |
| FR-DISC-08 | A signed-in user can save and unsave outfits and see them on `/account/saved`.                                                                                                                                                             | M        |
| FR-DISC-09 | Filters and sort state are kept in the URL so results can be shared and bookmarked.                                                                                                                                                        | S        |
| FR-DISC-10 | "Similar outfits" on the detail page.                                                                                                                                                                                                      | C        |
| FR-DISC-11 | Saved-search alerts.                                                                                                                                                                                                                       | W        |

### 6.6 Availability (AVAIL)

| ID          | Requirement                                                                                                                                       | Priority |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-AVAIL-01 | An owner can block and unblock date ranges on an outfit's availability calendar (`/lend/outfits/[id]/calendar`).                                  | M        |
| FR-AVAIL-02 | An owner cannot block dates that overlap an existing booking hold.                                                                                | M        |
| FR-AVAIL-03 | The database guarantees that no two holds (booking or owner block, including buffer days) overlap for the same outfit, under concurrent requests. | M        |
| FR-AVAIL-04 | Blocking dates automatically rejects pending requests that overlap the block.                                                                     | M        |
| FR-AVAIL-05 | The calendar shows held, blocked, buffer and free days, distinguishable without relying on colour alone.                                          | M        |

### 6.7 Booking (BOOK)

| ID         | Requirement                                                                                                                                                                                                                          | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-BOOK-01 | On the outfit detail page a renter chooses a start date and one duration option and sees a price breakdown: rental fee, refundable deposit and total to pay.                                                                         | M        |
| FR-BOOK-02 | The renter must accept the rental terms (the policy snapshot, including cancellation tiers, late fee and inspection window) before requesting.                                                                                       | M        |
| FR-BOOK-03 | A renter can request a booking (→ PENDING_APPROVAL) only if: they are not the owner; the outfit is ACTIVE; the duration is an active price option; the start date is between tomorrow and 180 days ahead (IST); the dates look free. | M        |
| FR-BOOK-04 | A renter can have at most one pending request per outfit and start date. Booking requests are rate-limited.                                                                                                                          | M        |
| FR-BOOK-05 | The request freezes the pricing, commission and policy snapshot, and sets the owner's approval deadline.                                                                                                                             | M        |
| FR-BOOK-06 | The owner sees requests on `/lend/requests` with dates, duration, earnings after commission, and the renter's public profile and reviews.                                                                                            | M        |
| FR-BOOK-07 | The owner can approve a request (→ AWAITING_PAYMENT). Approval takes the calendar hold; if the dates are no longer free the approval fails with a clear message and nothing changes.                                                 | M        |
| FR-BOOK-08 | The owner can reject a request (→ REJECTED) with an optional reason.                                                                                                                                                                 | M        |
| FR-BOOK-09 | A renter can withdraw a pending request (→ CANCELLED); no money is involved.                                                                                                                                                         | M        |
| FR-BOOK-10 | A request not decided by the approval deadline becomes EXPIRED.                                                                                                                                                                      | M        |
| FR-BOOK-11 | When a booking is CONFIRMED, or the owner blocks the dates, overlapping pending requests are automatically REJECTED and their renters notified.                                                                                      | M        |
| FR-BOOK-12 | A renter sees all their bookings on `/account/rentals` grouped by upcoming, in progress and past, and each booking's detail on `/account/rentals/[id]` (status, timeline, price breakdown, deadlines, condition reports, actions).   | M        |
| FR-BOOK-13 | An owner sees past and current rentals of their outfits on `/lend/history`.                                                                                                                                                          | M        |
| FR-BOOK-14 | From CONFIRMED onwards, each participant sees the other's phone number and the pickup address; before that, neither is shown.                                                                                                        | M        |
| FR-BOOK-15 | Every status change is recorded in an append-only booking history with actor and time, and the database refuses any status change that is not in the allowed transition table.                                                       | M        |
| FR-BOOK-16 | Instant book, counter-offers, multi-outfit bundles.                                                                                                                                                                                  | W        |

### 6.8 Payments (PAY)

| ID        | Requirement                                                                                                                                                                                          | Priority |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-PAY-01 | In AWAITING_PAYMENT the renter can pay the total (rental fee + deposit) in INR through the configured payment provider, as one payment.                                                              | M        |
| FR-PAY-02 | A booking becomes CONFIRMED only when a payment capture is verified by signature and confirmed by the provider for the exact amount and currency. A browser redirect alone never confirms a booking. | M        |
| FR-PAY-03 | The browser callback and the provider webhook both go through the same confirmation step; duplicate or out-of-order notifications confirm a booking at most once.                                    | M        |
| FR-PAY-04 | If the payment window passes, the system first checks with the provider; if paid it confirms, otherwise the booking becomes EXPIRED and the hold is released.                                        | M        |
| FR-PAY-05 | A payment captured after the booking has expired or been cancelled is automatically refunded in full.                                                                                                | M        |
| FR-PAY-06 | Refunds are recorded inside the same transaction as the state change and sent to the provider afterwards; failed refunds are retried and visible to admins.                                          | M        |
| FR-PAY-07 | A local sandbox payment provider (`/dev/sandbox-checkout/[orderId]`) supports pay, fail, abandon, callback-only, webhook-only and duplicate-webhook outcomes. It refuses to run in production.       | M        |
| FR-PAY-08 | A Razorpay adapter is implemented against test keys. Production use needs the provider's marketplace product and legal/tax advice (see [assumptions and risks](./assumptions-and-risks.md)).         | M        |
| FR-PAY-09 | Card holds (authorise now, capture on approval) instead of pay-after-approval.                                                                                                                       | W        |

### 6.9 Cancellation (CANC)

| ID         | Requirement                                                                                                                                                                                                                                         | Priority |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-CANC-01 | A renter or owner can cancel a booking in AWAITING_PAYMENT (→ CANCELLED); the hold is released and nothing is charged.                                                                                                                              | M        |
| FR-CANC-02 | A renter can cancel a CONFIRMED booking. The deposit is refunded in full and the rental fee is refunded by tier: 100% 7+ days before start, 50% between 48 hours and 7 days, 0% under 48 hours. The renter sees the exact refund before confirming. | M        |
| FR-CANC-03 | An owner can cancel a CONFIRMED booking. The renter is refunded in full, the owner receives nothing, and the cancellation is counted on the owner's record (visible to admins).                                                                     | M        |
| FR-CANC-04 | An admin can cancel a CONFIRMED booking with an explicit refund split and a written reason, audit-logged.                                                                                                                                           | M        |
| FR-CANC-05 | Where a renter cancellation retains part of the rental fee, the retained fee is settled like a completed rental: commission on the retained fee, the rest to the owner as a payout.                                                                 | M        |
| FR-CANC-06 | Owner-chosen cancellation policies per listing.                                                                                                                                                                                                     | W        |

### 6.10 Handover, return and condition reports (HAND)

| ID         | Requirement                                                                                                                                                                | Priority |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-HAND-01 | At handover the owner records a HANDOVER condition report with at least 3 photos and notes, from the booking page, no earlier than the day before the start.               | M        |
| FR-HAND-02 | The renter acknowledges the handover report (→ ACTIVE). An admin can override if the renter cannot.                                                                        | M        |
| FR-HAND-03 | Condition reports and their photos are timestamped, immutable once submitted, and visible to both participants and admins.                                                 | M        |
| FR-HAND-04 | At return the owner records a RETURN condition report with photos (→ RETURNED). An admin can override.                                                                     | M        |
| FR-HAND-05 | On return, late days are computed against the end date (IST) and a late fee of 1.5 × the daily rate per late day is applied from the deposit, capped at the deposit.       | M        |
| FR-HAND-06 | The return starts a 48-hour inspection window; the owner can confirm the return is fine (→ COMPLETED) or open a dispute within it; silence auto-completes at the deadline. | M        |
| FR-HAND-07 | An "overdue" label is shown when an ACTIVE booking passes its end date; the calendar hold is not extended.                                                                 | M        |
| FR-HAND-08 | The renter can add their own photos to a condition report as a counter-record.                                                                                             | S        |
| FR-HAND-09 | Platform pickup, delivery or courier tracking.                                                                                                                             | W        |

### 6.11 Deposits, settlement and payouts (DEP)

| ID        | Requirement                                                                                                                                                                                                               | Priority |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-DEP-01 | On CONFIRMED a security deposit record is created in status HELD for the snapshot amount.                                                                                                                                 | M        |
| FR-DEP-02 | Every exit from a paid booking runs one settlement rule: refund = (fee − retained fee) + (deposit − withheld deposit); commission = 15% of the retained fee; owner payout = retained fee − commission + withheld deposit. | M        |
| FR-DEP-03 | Deposit status ends as RELEASED, PARTIALLY_WITHHELD or FORFEITED, with the reason (late fee, damage, missing items).                                                                                                      | M        |
| FR-DEP-04 | No commission is taken on any part of the deposit withheld for the owner.                                                                                                                                                 | M        |
| FR-DEP-05 | A reconciliation view shows, per booking, that refunds + payout + commission equal the amount captured; any imbalance is an alert.                                                                                        | M        |
| FR-DEP-06 | Each settlement creates a payout record owed to the owner. An admin marks it PAID with a payment reference (`/admin/payouts`); the action is audit-logged.                                                                | M        |
| FR-DEP-07 | The owner sees earnings (`/lend/earnings`): per booking fee, commission, withheld deposit, net payout, payout status and reference.                                                                                       | M        |
| FR-DEP-08 | Automated payouts through a provider's marketplace or split-settlement product.                                                                                                                                           | W        |

### 6.12 Disputes (DISP)

| ID         | Requirement                                                                                                                                                                                                                    | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-DISP-01 | From CONFIRMED (on or after the start date), either participant can open a dispute for "handover failed" or "not as described".                                                                                                | M        |
| FR-DISP-02 | From ACTIVE, the owner can open a dispute for "not returned" and the renter for "return not acknowledged". The system opens one automatically when a booking is more than 3 days overdue.                                      | M        |
| FR-DISP-03 | From RETURNED, inside the inspection window, the owner can claim damage or missing items, and the renter can contest the late fee. A claim cannot exceed the deposit minus the late fee.                                       | M        |
| FR-DISP-04 | A dispute requires a reason, a description and evidence (photos and/or reference to condition reports). There is at most one open dispute per booking. Dispute creation is rate-limited.                                       | M        |
| FR-DISP-05 | The respondent can accept the claim (→ COMPLETED, claim withheld), and the opener can withdraw (→ COMPLETED, no claim).                                                                                                        | M        |
| FR-DISP-06 | An admin resolves a dispute (`/admin/disputes`) by setting the withheld deposit and any rental refund explicitly with written notes (→ COMPLETED), or by cancelling where the rental never effectively happened (→ CANCELLED). | M        |
| FR-DISP-07 | The admin dispute page shows the handover and return condition reports side by side, the evidence, the booking history and the policy snapshot.                                                                                | M        |
| FR-DISP-08 | Claims above the deposit (for example full replacement value). Peti cannot recover more than the deposit.                                                                                                                      | W        |

### 6.13 Reviews (REV)

| ID        | Requirement                                                                                                                       | Priority |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-REV-01 | Only the two participants of a COMPLETED booking can review each other, once each, within 14 days of completion.                  | M        |
| FR-REV-02 | Reviews are double-blind: hidden until both have submitted or the 14-day window closes.                                           | M        |
| FR-REV-03 | A review has a 1–5 rating and optional text; it is shown on the reviewee's public profile and, for owners, on their outfit pages. | M        |
| FR-REV-04 | A user sees reviews they have written and received on `/account/reviews`.                                                         | M        |
| FR-REV-05 | An admin can hide a review that breaks the content rules, with a reason, audit-logged.                                            | S        |
| FR-REV-06 | The reviewee can post one public reply.                                                                                           | C        |

### 6.14 Notifications (NOTIF)

| ID          | Requirement                                                                                                                                                                                                             | Priority |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-NOTIF-01 | In-app notifications and email for: new request, approved, rejected, expired, payment confirmed, cancellation, handover recorded, return recorded, dispute opened and resolved, review window open, payout marked paid. | M        |
| FR-NOTIF-02 | Reminders before deadlines: owner response, payment, handover day, return day, inspection window end.                                                                                                                   | S        |
| FR-NOTIF-03 | Notifications are created in the same transaction as the event and dispatched afterwards, so none are lost or sent for events that rolled back.                                                                         | M        |
| FR-NOTIF-04 | SMS or WhatsApp notifications other than OTP.                                                                                                                                                                           | W        |

### 6.15 Admin (ADMIN)

| ID          | Requirement                                                                                                                                                                               | Priority |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-ADMIN-01 | Overview (`/admin`): counts of pending listings, open disputes, overdue rentals, failed refunds and unpaid payouts, plus basic marketplace metrics from section 4.                        | M        |
| FR-ADMIN-02 | Users (`/admin/users`): search, view profile, bookings, owner cancellation count and disputes; suspend and reinstate.                                                                     | M        |
| FR-ADMIN-03 | Bookings (`/admin/bookings`): search and filter by status; view detail and history; override handover or return; cancel with an explicit split.                                           | M        |
| FR-ADMIN-04 | Disputes (`/admin/disputes`): queue and resolution as FR-DISP-06/07.                                                                                                                      | M        |
| FR-ADMIN-05 | Payouts (`/admin/payouts`): outstanding and paid payouts with owner UPI ID; mark paid with a reference.                                                                                   | M        |
| FR-ADMIN-06 | Activity (`/admin/activity`): the append-only audit log, filterable by admin, action and target. Every admin action, payout, dispute resolution, refund retry and suspension is recorded. | M        |
| FR-ADMIN-07 | Admin retry of a failed refund.                                                                                                                                                           | M        |

### 6.16 Public content (CONT)

| ID         | Requirement                                                                                                                                                                         | Priority |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-CONT-01 | How it works (`/how-it-works`) explains renting and lending, including the money flow, deposit, cancellation tiers and inspection window.                                           | M        |
| FR-CONT-02 | About (`/about`), terms (`/terms`) and privacy (`/privacy`) pages. Terms and privacy are drafts for legal review and are versioned; the accepted version is stored on each booking. | M        |
| FR-CONT-03 | Trust and safety (`/trust-and-safety`) as FR-PROF-05, including that Peti does not take custody of garments and that the deposit is the maximum recoverable amount.                 | M        |
| FR-CONT-04 | Gujarati language interface.                                                                                                                                                        | W        |

---

## 7. Non-functional requirements

| ID           | Area            | Requirement                                                                                                                                                                                                                            |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-01   | Security        | Authorisation is checked on the server in every use case (owner of outfit, participant of booking, admin role). Route-level redirects are a convenience, never a control.                                                              |
| NFR-SEC-02   | Security        | Every input is validated with the same schema on client and server.                                                                                                                                                                    |
| NFR-SEC-03   | Security        | Payment callbacks and webhooks are verified by signature over the raw body; failed verification stores nothing.                                                                                                                        |
| NFR-SEC-04   | Security        | Secrets come only from validated environment variables, with no defaults in code; the sandbox payment provider cannot boot in production.                                                                                              |
| NFR-SEC-05   | Security        | Passwords are hashed by the auth library; sessions are HTTP-only, secure, same-site cookies.                                                                                                                                           |
| NFR-SEC-06   | Security        | Uploads are checked by magic bytes and size, re-encoded and served through the application, never executed.                                                                                                                            |
| NFR-SEC-07   | Security        | Rate limits on auth, booking requests, uploads and disputes.                                                                                                                                                                           |
| NFR-SEC-08   | Security        | An independent security review before any production launch; findings tracked in `docs/security/`.                                                                                                                                     |
| NFR-PRI-01   | Privacy         | Collect the minimum: no ID documents, no Aadhaar, no date of birth. Photo EXIF and GPS data are stripped.                                                                                                                              |
| NFR-PRI-02   | Privacy         | Phone numbers and addresses are shown only to the other participant from CONFIRMED, and to admins.                                                                                                                                     |
| NFR-PRI-03   | Privacy         | The privacy notice describes what is collected, why, and for how long. A compliance review against India's Digital Personal Data Protection Act, 2023 and its rules is needed before launch (not legal advice).                        |
| NFR-PRI-04   | Privacy         | Logs never contain passwords, OTPs, tokens, full card details or full addresses.                                                                                                                                                       |
| NFR-A11Y-01  | Accessibility   | Target WCAG 2.2 level AA for all pages: keyboard operable, visible focus, labelled form fields, sufficient contrast, target size, no information by colour alone, respects reduced-motion preferences.                                 |
| NFR-A11Y-02  | Accessibility   | Automated accessibility checks (axe) run in CI on public pages; key journeys are checked manually with a keyboard and a screen reader before launch.                                                                                   |
| NFR-PERF-01  | Performance     | Pages are usable on a mid-range Android phone on a mobile connection: server-rendered, responsive images in modern formats, no heavy client libraries on public pages. Budgets are set after the first measurements, not guessed here. |
| NFR-PERF-02  | Performance     | Search uses database indexes (full text and trigram) rather than scanning listings.                                                                                                                                                    |
| NFR-REL-01   | Reliability     | No double booking under concurrency, enforced by a database exclusion constraint and proven by concurrency tests.                                                                                                                      |
| NFR-REL-02   | Reliability     | All money is integer paise; amounts on a booking are snapshotted and never recomputed.                                                                                                                                                 |
| NFR-REL-03   | Reliability     | Background work (expiry, auto-complete, refund and notification dispatch) runs in an idempotent sweep that is safe to run repeatedly or concurrently.                                                                                  |
| NFR-REL-04   | Reliability     | Provider calls never happen inside a database transaction; refunds and notifications use an outbox.                                                                                                                                    |
| NFR-REL-05   | Reliability     | Database backups and a tested restore procedure before production launch.                                                                                                                                                              |
| NFR-OBS-01   | Observability   | Structured logs with a request ID; payment, refund and webhook events logged with their provider IDs.                                                                                                                                  |
| NFR-OBS-02   | Observability   | A health endpoint for uptime checks.                                                                                                                                                                                                   |
| NFR-OBS-03   | Observability   | Admin overview surfaces operational alerts: failed refunds, failed webhook processing, reconciliation imbalance, overdue rentals.                                                                                                      |
| NFR-OBS-04   | Observability   | Append-only audit log for admin and money actions; append-only booking status history.                                                                                                                                                 |
| NFR-I18N-01  | Locale          | All dates and deadlines are computed and shown in IST; amounts are shown in rupees with Indian digit grouping (for example ₹1,25,000).                                                                                                 |
| NFR-MAINT-01 | Maintainability | Modular monolith with layer rules checked in CI; open-source licence; documented local setup that works from a clean clone.                                                                                                            |

---

## 8. Pages in scope

| Area     | Pages (route)                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public   | Landing `/`, explore `/explore`, category `/categories/[slug]`, outfit detail `/outfits/[slug]`, how it works `/how-it-works`, about `/about`, trust and safety `/trust-and-safety`, terms `/terms`, privacy `/privacy`                          |
| Auth     | Sign-up `/sign-up`, sign-in `/sign-in`, password recovery `/forgot-password` and `/reset-password`, email verification `/verify-email`                                                                                                           |
| Renter   | Profile `/account/profile`, addresses `/account/addresses`, my rentals `/account/rentals`, booking detail `/account/rentals/[id]`, saved outfits `/account/saved`, reviews `/account/reviews`                                                    |
| Owner    | Dashboard `/lend`, create listing `/lend/outfits/new`, edit listing `/lend/outfits/[id]/edit`, availability calendar `/lend/outfits/[id]/calendar`, booking requests `/lend/requests`, rental history `/lend/history`, earnings `/lend/earnings` |
| Admin    | Overview `/admin`, users `/admin/users`, listing moderation `/admin/listings`, bookings `/admin/bookings`, disputes `/admin/disputes`, payouts `/admin/payouts`, categories `/admin/categories`, activity `/admin/activity`                      |
| Dev only | Outbox `/dev/outbox`, sandbox checkout `/dev/sandbox-checkout/[orderId]`, design system `/dev/design-system` — 404 outside local and test                                                                                                        |

The booking detail page is shared: the owner reaches the same booking page from `/lend/requests` and
`/lend/history`, and sees owner actions (approve, reject, record handover, record return, confirm return,
open dispute) where the renter sees renter actions.

## 9. MVP scope and later

| Capability            | MVP                                                      | Later (candidates, not commitments)                                                                      |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Geography             | Ahmedabad; city stored as data                           | Gandhinagar, Surat, Vadodara, Rajkot (where competitors already list)                                    |
| Handover              | In person, condition reports with photos                 | Optional partner courier or pickup, priced to the renter                                                 |
| Communication         | Contact details revealed on CONFIRMED                    | In-app messaging with moderation                                                                         |
| Pre-booking questions | Listing detail and measurements only                     | A short note with the request; structured fit questions                                                  |
| Payment               | One payment for fee + deposit after approval             | Card or UPI mandate holds; provider marketplace split settlement                                         |
| Payouts               | Recorded; admin marks paid manually                      | Automated payouts through the provider's marketplace product                                             |
| Trust                 | Email and phone verification; reviews; condition reports | Identity verification through a licensed provider, if justified                                          |
| Protection            | Deposit as the recoverable cap                           | Optional protection add-on through an insurance partner                                                  |
| Monetisation          | 15% owner-side commission                                | Renter service fee, featured listings (see [business model](./business-model.md#9-later-options-future)) |
| Booking               | Request-to-book, fixed durations                         | Longer durations, multi-outfit bookings, try-on appointments                                             |
| Seasonality           | Same rules all year                                      | Peak-season booking windows and cancellation rules (H6)                                                  |
| Language              | English                                                  | Gujarati and Hindi                                                                                       |
| Apps                  | Responsive web                                           | Installable web app, then native apps if justified                                                       |

## 10. Open questions

These need a decision or validation; none blocks the MVP build, and each has a default.

| #    | Question                                                                                                                                                                               | MVP default                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-1 | Should edits to an ACTIVE listing (photos, title, description, category) send it back for review?                                                                                      | Yes for photos, title, description and category; no for price, deposit, buffer and pause.                                                                                  |
| OQ-2 | For a booking starting tomorrow, the owner may approve until 18:00 IST today but the payment window ends 12 hours before the start. What happens when approval leaves no payment time? | Approval is refused with a clear message when the computed payment deadline is already past; to be confirmed in [booking lifecycle](../architecture/booking-lifecycle.md). |
| OQ-3 | What is the daily rate used for the late fee?                                                                                                                                          | Rental fee ÷ rental days, snapshotted as a per-day late fee in paise.                                                                                                      |
| OQ-4 | If the renter does not turn up for handover, how should the admin settle the dispute?                                                                                                  | Admin guideline: treat as a renter cancellation under 48 hours (fee retained, deposit refunded).                                                                           |
| OQ-5 | Does an owner's cancellation count have consequences (warnings, suspension)?                                                                                                           | Visible to admins only; action is manual.                                                                                                                                  |
| OQ-6 | Should phone verification be required before requesting or listing (FR-AUTH-07)?                                                                                                       | Yes, because the phone number is the only contact channel after confirmation.                                                                                              |
