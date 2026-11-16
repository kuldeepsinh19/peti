# Discovering and renting an outfit

How a member finds an outfit owned by someone else and starts the rental. The rules behind each step are in
[marketplace-discovery.md](../architecture/marketplace-discovery.md); the booking itself is unchanged and
described in [booking-lifecycle.md](../architecture/booking-lifecycle.md).

## 1. Explore outfits — `/explore`

Reached from "Explore outfits" in the header, the phone bar, the home hero or the footer.

- **Categories** run across the top as a row of names ("Everything", Sherwanis, Lehengas…). Choosing one
  filters the grid; each also has its own page at `/categories/[slug]`.
- **Filters** (kept in the URL, so a search can be shared or bookmarked):

  | Filter          | Notes                                                                                   |
  | --------------- | --------------------------------------------------------------------------------------- |
  | Keyword         | Outfit name, description, label, colour and fabric; tolerant of misspellings ("lehnga") |
  | Category        | Includes its sub-categories                                                             |
  | Occasion        | Mehendi, Haldi, Sangeet, Wedding, Reception, Engagement, Navratri                       |
  | Size            |                                                                                         |
  | Locality        | Within Ahmedabad, the only city for now                                                 |
  | Wearing it from | A start date: only outfits free for that rental (plus cleaning days) are shown          |
  | More filters    | Rental length, price from and to (₹), chest and waist (cm), order                       |

- **Results** are 24 to a page, newest first unless ordered by price or relevance.
- **Each card** shows the cover photograph, category, size and locality, the outfit name, the price for the
  shortest rental and the deposit, and the lender: their name with "★ 4.7 · 12 rentals", "3 rentals
  completed" or "New lender". When a date is chosen, every card also says it is free from that date.

Only **published** outfits from lenders in good standing appear. Drafts, outfits awaiting approval, paused,
rejected or suspended ones never do.

## 2. The outfit page — `/outfits/[slug]`

- A **gallery**: the large photograph, a strip of the rest (the arrow keys move between them).
- Category, size, locality; the name; the occasions it suits.
- **Prices** for every rental length offered, and the refundable deposit.
- The **request button** ("Choose your dates"), or "Sign in to request", or a prompt to confirm email and
  mobile first. The lender sees "This is your outfit" instead.
- **Save for later** (to `/account/saved`).
- About the outfit; **Availability**: a calendar with booked and blocked days struck out (never who booked
  them); measurements; condition and what it cost new; **How renting works**; reviews; **Lent by**: member
  since, completed rentals, rating, confirmed email and mobile, and that Peti does not check ID.

"How renting works" states the request and payment windows, the deposit, cancellation refunds, the late fee
and the cleaning days from the same values the booking and settlement code uses.

## 3. Requesting — the existing booking flow

"Choose your dates" opens `/outfits/[slug]/request`: the rental length, a calendar of possible start dates
(held days and starts that would run into a hold are disabled), the total with the deposit, a note to the
owner and the terms. "Send request" creates the request; from there the rental follows the booking
lifecycle unchanged: the owner approves, the renter pays, the outfit is handed over and returned, the deposit
is settled.

## What a renter can never do

- Request their own outfit.
- Request an outfit that is not published, or from a suspended lender.
- See a lender's phone number or address before the booking is paid.
- See who else has booked an outfit.
