# POC demo guide

How to show Peti's ten core journeys on a local machine, with nothing real behind it: no money moves, no
email or text message is sent, and every person and outfit is fictional.

The public demo (peti-kappa.vercel.app) is a read-only showcase of browsing and booking requests. Uploading
photographs, moderation, condition reports and the administrator are local-only; the reasons are in
[What the public demo cannot do](#what-the-public-demo-cannot-do).

## Set up

Follow [local setup](local-setup.md) once (Node 24, pnpm, Docker), then:

```bash
docker compose up -d          # PostgreSQL
pnpm db:migrate               # apply migrations
pnpm db:seed                  # localities, categories, six accounts, ten published listings (3 photos each)
pnpm db:seed:bookings         # ready-made bookings for today (see below)
pnpm dev                      # http://localhost:3000
```

Every seeded account uses the password `peti-demo-password`. The sign-in page lists them on a local
machine.

| Account            | Role                                     |
| ------------------ | ---------------------------------------- |
| `rohan@peti.local` | Renter. Has the ready-made bookings      |
| `aarav@peti.local` | Owner                                    |
| `kabir@peti.local` | Owner                                    |
| `meera@peti.local` | Owner                                    |
| `isha@peti.local`  | Owner                                    |
| `admin@peti.local` | Administrator (never on the public demo) |

Use two browser windows (one private) to be two people at once.

### Ready-made bookings

A real rental takes days: the handover is on the start day, the return on the end day, then there is a
48-hour inspection window. Peti has no fake clock. Instead, `pnpm db:seed:bookings` creates bookings
dated relative to today, each made through the real flow (request, approval, simulated payment,
condition reports) as if those steps had happened on the right days:

| Booking          | State today                   | Shows                                                   |
| ---------------- | ----------------------------- | ------------------------------------------------------- |
| starts-today     | Paid, starts today            | Handover, the renter's confirmation, return, completion |
| ends-today       | Handed over, due back today   | Recording the return                                    |
| returned         | Returned yesterday            | Confirming the condition, or claiming for damage        |
| awaiting-payment | Approved, payment window open | A declined payment, paying, cancelling and the refund   |
| completed        | Completed                     | Reviews                                                 |

The script prints each booking's reference and owner. Run it again whenever you like: bookings still at
their stage are kept, and one a demo has moved on is replaced with a fresh one. The payment window of
the awaiting-payment booking is 12 hours; after that, run the script again. It refuses to run unless
`APP_ENV` is `local` or `test`.

### Simulated, and where to see it

| What                 | In this POC                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Payments and refunds | A sandbox provider at `/dev/sandbox-checkout` that signs callbacks and webhooks like a real one |
| Emails and SMS codes | Written to the **Outbox** at `/dev/outbox` (linked from the banner on every page)               |
| Payouts to owners    | Recorded by an administrator with a reference; nothing is sent                                  |
| Background jobs      | Run every few minutes in a deployment; run them on demand from **Tools** at `/dev`              |
| Identity checks      | Not built. Nobody is shown as identity-verified                                                 |

A banner on every page says the POC is simulated, the pay button reads "Pay ₹… (simulated)", and the
checkout page says no money moves.

## The ten journeys

### 1. Register and sign in

1. **Join Peti** (header). Enter a name, an email and a password; tick the terms. The terms version and
   the time are recorded on the account.
2. Open the **Outbox** and follow the confirmation link.
3. **Profile & settings → Profile**: add a mobile number, then read the six-digit code in the Outbox and enter it. Requesting
   or listing an outfit needs a confirmed email and a verified mobile.
4. Sign out and sign back in.

### 2. Create a listing with photographs

As an owner (or your new account): **List an outfit**.

1. **Details**: name, category, size, description, occasions, prices for each length offered, value new,
   deposit, pickup address and locality. **Save and add photographs**.
2. **Photographs**: add at least three (front, back and a close-up of the work); with two, the page says so
   and will not continue. Choose the cover.
3. **Preview**: the card and the page renters will see. **Submit for review**. My outfits shows it as
   _Pending approval_; renters cannot find it.

### 3. Moderation and approval

As `admin@peti.local`: **Admin → Listings** (the _Pending approval_ view).

- **Approve and publish**: the owner is notified, and the listing appears in Explore.
- **Request changes** (with a reason): the owner sees the reason and can edit and resubmit.
- An administrator cannot moderate their own listing.

### 4. Browse as another user

Signed out or as `rohan@peti.local`: **Explore outfits**. Search by name (misspellings are tolerated), filter
by category, occasion, size, locality, price, measurements or dates (only outfits free on those dates). Open
an outfit: photographs, real measurements, condition, prices, deposit and the owner's record.

### 5. Check availability and request

On an outfit page: **Choose your dates**. Held dates are struck out. Pick a length and a start date; the
price, deposit and Peti's fee are shown before you accept the terms. **Send request**: the booking page says
the request was sent and when the owner must answer. Nothing is charged yet.

### 6. Simulated payment

As the owner (Rental requests): **Approve request**. As the renter, on the booking: **Pay ₹… (simulated)**.
On the sandbox checkout choose **Pay**: the booking is confirmed and the contact details and pickup address
are shared. Or use the ready-made _awaiting-payment_ booking.

### 7. Booking, handover and return

Use the ready-made _starts-today_ booking (the script names its owner).

1. Owner: on the booking, record the **handover**: condition, notes, at least three photographs.
2. Renter: notified; reads the report and confirms **It matches — I have the outfit**.
3. Owner: **Record return** with photographs (late fees apply automatically after the end date).
4. Owner: **Confirm it is fine**. The rental is complete: the deposit refund is queued for the renter and
   the payout recorded for the owner. Both can now leave a review.

The _ends-today_ and _returned_ bookings start part-way through, and _returned_ can also show a damage
claim (**Report a problem**), which keeps the deposit held until an administrator decides.

### 8. Cancellation, payment failure and refund

With the _awaiting-payment_ booking, as Rohan:

1. **Pay ₹… (simulated)** → **Card declined** → **Decline**. The booking says the payment failed, nothing
   was taken, and it can still be paid.
2. Pay again and choose **Pay**.
3. **Cancel this booking** → **Cancel booking**. Under Money the refund shows as _queued_.
4. **Tools** (`/dev`) → **Run background jobs now**. Back on the booking, the refund has been sent to the
   (sandbox) provider.

### 9. Manage listings, bookings and account

- **My outfits**: each listing's status, requests waiting, upcoming rentals; pause, resume, edit, archive,
  calendar blocks.
- **Rental requests** and **Past rentals** (owner), **My rentals** (renter), **Earnings** with the payout
  UPI ID (changes are audited and announced to the account holder).
- **Profile & settings**: profile, addresses (one used by a listing cannot be removed), notifications.

### 10. Administration

As `admin@peti.local`: **Admin**. Overview figures link to their queues: listings to review, open disputes,
payouts to send, failed refunds. Also users (suspending one tells the other side of open bookings), bookings
with their money timeline, disputes (decisions in rupees and paise), payouts (record as paid), money health
checks, categories and the append-only activity log.

## What the public demo cannot do

The public demo runs on a read-only file system with shared accounts whose password is published, and has
no administrator account. So there:

- photographs cannot be uploaded or removed, and condition reports are switched off;
- edits that would send a published listing back to review are refused (no one would review them);
- sign-up and password recovery are switched off.

Browsing, searching, requesting, approving and paying through the sandbox work there.

## Automated checks of these journeys

`pnpm build && pnpm test:e2e` runs them in Chromium: journeys 1, 2, 4, 5 and 6 in `auth.spec.ts`,
`marketplace.spec.ts` and `booking.spec.ts`; moderation, the handover to completion, the declined payment,
cancellation and refund, and an axe accessibility check of six key pages in `poc-journeys.spec.ts` (which
runs `pnpm db:seed:bookings` itself).
