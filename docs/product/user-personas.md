# User personas

> **These are hypothetical archetypes, not research findings.** They were written from the product brief and
> the [competitor research](./competitor-research.md). No interviews, surveys or user research have been
> done. No persona represents a real person, and none of the details (ages, habits, motivations) is a
> measured fact. Each persona lists what it is grounded in and which beliefs about it are unvalidated, so the
> archetypes can be tested and replaced as real evidence arrives. The beliefs are tracked in the
> [assumptions register](./assumptions-and-risks.md#assumptions-register).

Related: [product requirements](./product-requirements.md) · [user journeys](./user-journeys.md) ·
[business model](./business-model.md)

## Overview

| ID  | Archetype                     | Main role          | Grounded in                                                                                        |
| --- | ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| P1  | The once-worn bridal wardrobe | Owner              | Brief (premium occasionwear, C2C); Anokhi Reet sample listing and categories (VF)                  |
| P2  | The sherwani in the cupboard  | Owner              | Hypothesis H4 (menswear); Candidmen not in Ahmedabad (VF)                                          |
| P3  | The wedding-season guest      | Renter             | Peak season Nov–Feb (unverified vendor blog); multi-function weddings in the brief's category list |
| P4  | The Navratri regular          | Renter, then owner | Navratri and chaniya choli categories on Anokhi Reet and WEVTRA (VF); H6                           |
| P5  | The groom's side              | Renter             | Sherwani / Jodhpuri categories (VF); H4                                                            |
| P6  | The swapper                   | Owner and renter   | Brief: a user can be both owner and renter                                                         |
| P7  | The marketplace operator      | Admin              | Brief: admin moderation, disputes, manual payouts                                                  |

Every persona lives in Ahmedabad, because the MVP operates only there.

---

## P1 — The once-worn bridal wardrobe (owner)

**Situation (hypothetical).** Married in the last few years. Owns a bridal lehenga and two or three heavy
party lehengas that cost far more than she would spend on a garment now, each worn once or twice. They are
stored at home and take up space.

**Goals**

- Recover part of what the garments cost.
- Lend only to people she is comfortable with, on dates that suit her.
- Get the garment back in the same condition.

**Fears and frustrations**

- A stranger damaging or not returning a garment worth many times the rent.
- Haggling over price, deposit and "was that stain there before?" in chat.
- Handing over a garment and then chasing money (the off-platform model the local classifieds use).
- A platform holding her garments or earnings and then changing hands (the Flyrobe complaints, unverified
  individual posts, [competitor research §6](./competitor-research.md#6-flyrobe--rent-it-bae--history)).

**What Peti offers her**

- She approves every request and sees the renter's profile and reviews first.
- The deposit is collected on-platform before she hands anything over; she sets it (from ₹500 up to the
  declared retail value).
- Timestamped photos of the garment's condition at handover and at return.
- A fixed 48-hour window to raise damage, decided by an admin, not by argument.
- She keeps the garment at all times between rentals; Peti never takes custody.

**Unvalidated beliefs:** that she will accept a 15% commission when rivals advertise 0%
([A-03](./assumptions-and-risks.md#assumptions-register)); that a deposit capped at what she sets feels
enough protection for a bridal piece ([A-11](./assumptions-and-risks.md#assumptions-register)); that she is
willing to meet renters in person ([A-05](./assumptions-and-risks.md#assumptions-register)).

---

## P2 — The sherwani in the cupboard (owner)

**Situation (hypothetical).** Bought a sherwani or Jodhpuri suit for his own wedding or a sibling's. It has
not been worn since, and he does not expect to wear it again.

**Goals**

- Earn something from a garment that is otherwise sunk cost.
- Spend as little time as possible: list once, approve requests on his phone, meet briefly for handover.

**Fears and frustrations**

- Chat back-and-forth about dates and price.
- Alterations: renters asking to take in or let out seams.

**What Peti offers him**

- Fixed duration options with his own price for each, so there is nothing to negotiate.
- Typed measurements on the listing so renters self-select on fit.
- A one-day cleaning buffer added automatically between rentals.

**Unvalidated beliefs:** that menswear supply and demand exist in Ahmedabad at all (hypothesis H4,
[A-17](./assumptions-and-risks.md#assumptions-register)); that measurements are enough without a try-on
([A-08](./assumptions-and-risks.md#assumptions-register)).

---

## P3 — The wedding-season guest (renter)

**Situation (hypothetical).** Invited to a family wedding between November and February with several
functions — mehendi, sangeet, wedding, reception — each wanting a different look. Buying a new outfit for
each function is expensive and most would be worn once.

**Goals**

- Find several outfits for specific dates, in her size, in one place.
- Know the full cost, including the deposit, before committing.
- Get the deposit back promptly.

**Fears and frustrations**

- Paying a deposit by UPI to a stranger with no guarantee of getting it back.
- The outfit not fitting or not looking like the photos.
- An owner cancelling at the last minute.
- Being blamed for damage that was already there.

**What Peti offers her**

- A date filter that only shows outfits free on her dates.
- A price breakdown (rental fee, refundable deposit, total) before she requests.
- Payment held on-platform, and a full refund if the owner cancels.
- A handover report with photos she acknowledges, so existing marks are on record.

**Unvalidated beliefs:** that she will plan far enough ahead for the approval and payment windows
([A-13](./assumptions-and-risks.md#assumptions-register)); that she accepts in-person collection
([A-05](./assumptions-and-risks.md#assumptions-register)); that peak-season demand is concentrated as the
vendor blog suggests ([A-18](./assumptions-and-risks.md#assumptions-register)).

---

## P4 — The Navratri regular (renter, then owner)

**Situation (hypothetical).** Plays garba every Navratri and wants a different chaniya choli across the
nine nights. Owns several from past years that she no longer wears.

**Goals**

- Rent a few outfits for the festival nights at a modest price.
- Lend her older chaniya cholis to others.

**Fears and frustrations**

- Every owner wanting the same dates; outfits booked out early.
- Sweat and wear after a night of garba, and who pays for cleaning.

**What Peti offers her**

- The 7-day duration option and calendar availability visible up front.
- The same account to rent and to lend.
- A turnaround buffer for cleaning, set by the owner.

**Unvalidated beliefs:** that chaniya choli rents (an unverified vendor blog suggests a low band) leave
enough value after commission and gateway costs for both sides
([A-03](./assumptions-and-risks.md#assumptions-register), [R-01](./assumptions-and-risks.md#risk-register));
that hygiene expectations can be met by owner cleaning
([A-06](./assumptions-and-risks.md#assumptions-register)).

---

## P5 — The groom's side (renter)

**Situation (hypothetical).** A groom, or the groom's brother or close friend, needs a sherwani or Jodhpuri
suit for one or two days of a wedding.

**Goals**

- A premium-looking outfit that fits, for exact dates that cannot move.
- Certainty: once booked, it must be there.

**Fears and frustrations**

- The owner not turning up or cancelling close to the date.
- No time to find an alternative if the fit is wrong.

**What Peti offers him**

- A booking is confirmed only after payment is verified, and the calendar is held from the moment the owner
  approves, so no one else can take the dates.
- Handover can happen the day before the start.
- If the outfit is not as described at handover, he can open a dispute and an admin decides.

**Unvalidated beliefs:** that an owner cancellation counted on the owner's record, plus a full refund, is
enough reassurance ([A-12](./assumptions-and-risks.md#assumptions-register)); see the no-show risk
[R-08](./assumptions-and-risks.md#risk-register).

---

## P6 — The swapper (owner and renter)

**Situation (hypothetical).** Lends a few garments and rents others for her own events. Treats Peti as a
shared wardrobe within her city.

**Goals**

- One account, one profile and reviews from both sides.
- Earnings from lending offset what she spends renting.

**What Peti offers her**

- Owner and renter areas under one account; reviews as owner and as renter on one profile.
- Earnings view per booking.

**Unvalidated beliefs:** that two-sided users exist in meaningful numbers
([A-20](./assumptions-and-risks.md#assumptions-register)). Earnings are paid out to her, not netted against
her rentals, in the MVP.

---

## P7 — The marketplace operator (admin)

**Situation.** A member of the Peti team, at launch probably one or two people, who moderates listings,
resolves disputes, marks payouts as paid and watches for problems.

**Goals**

- Clear queues: listings to review, disputes to resolve, payouts to mark paid, failed refunds to retry.
- Evidence in one place for a dispute: both condition reports side by side, the booking history and the
  policy snapshot the renter accepted.
- Every decision recorded, so it can be explained later.

**Fears and frustrations**

- Being asked to judge damage without evidence.
- Money that does not add up.
- Being the only person who knows why a payout was made.

**What Peti offers them**

- Admin pages for overview, users, listing moderation, bookings, disputes, payouts, categories and activity.
- A reconciliation view per booking (refund + payout + commission = captured).
- An append-only audit log of every admin action.

**Unvalidated beliefs:** that manual payouts and dispute handling are manageable at launch volume
([A-19](./assumptions-and-risks.md#assumptions-register)).

---

## Who is not a target user in the MVP

| Group                                        | Why not                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Rental shops, boutiques and designers        | Vendor listings are out of scope; Peti is C2C.                        |
| People outside Ahmedabad                     | No platform logistics; handover is in person in one city.             |
| Renters wanting same-day or next-hour rental | Bookings start from tomorrow at the earliest and need owner approval. |
| Owners wanting Peti to store or clean items  | Peti never takes custody of garments.                                 |
