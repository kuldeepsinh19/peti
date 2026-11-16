# Marketplace discovery

How renters find outfits: the `search` module (`src/modules/search`) for Explore, categories, saved outfits
and the outfit page, and the parts of the `bookings` module the outfit page shows.

## Who can see what

An outfit is **discoverable** when, and only when:

1. its status is `ACTIVE` (Published), and
2. its owner is not suspended (`users.banned`).

This one condition is applied to Explore, category pages, saved outfits and "New in the wardrobe" on the
home page. The outfit page (`searchUseCases.outfit`) applies it too, except that the owner and
administrators can open their non-published outfits (the owner sees a "Not visible to renters" notice). For
everyone else a hidden outfit is simply not found — its existence is not revealed.

Requesting re-checks it independently: the request page redirects, and `requestBooking` locks the outfit
and refuses anything not `ACTIVE`, a suspended owner, or the renter's own outfit (`OWN_OUTFIT`).

## Explore query

`exploreQuerySchema` (`application/contracts.ts`) reads the URL. Every field is lenient: a malformed value is
dropped rather than failing the page.

| Parameter                      | SQL                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                            | `outfit_search_document(...) @@ prefix tsquery` (title A; brand, colour, fabric B; description C) **or** trigram `word_similarity` on the title > 0.4 |
| `category`                     | The category's slug or any direct child                                                                                                               |
| `occasion`, `size`             | Array containment / equality                                                                                                                          |
| `locality`                     | Slug equality (Ahmedabad is the only city)                                                                                                            |
| `minPrice`, `maxPrice`         | Rupees, against the chosen rental length's price, or the cheapest active price when none is chosen                                                    |
| `from`, `days`                 | `NOT EXISTS` a calendar hold overlapping `[from, from + days + cleaning days)`                                                                        |
| `chestMin/Max`, `waistMin/Max` | `EXISTS` a measurement row in range (cm → mm)                                                                                                         |
| `sort`, `page`                 | Newest, price ascending or descending, relevance; 24 a page, total by `COUNT(*) OVER ()`                                                              |

Partial GIN indexes on the search document, the trigram title and occasions (`WHERE status = 'ACTIVE'`)
keep this cheap. It is raw SQL in `catalogue-queries.ts`, parameterised throughout.

## The card

`OutfitCard` is one projection (`cardSelect`) shared by Explore, saved outfits and the home row. Phase 3
added the lender:

| Field                             | Source                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ownerName`                       | Profile display name, else account name                                                                    |
| `ownerRating`, `ownerRatingCount` | `user_profiles.owner_rating_sum / owner_rating_count` — published reviews only, kept by the reviews module |
| `ownerCompletedRentals`           | Bookings in `COMPLETED` for that owner                                                                     |

`ownerTrustLine` turns these into "★ 4.7 · 12 rentals", "3 rentals completed" or "New lender". Nothing else
about the lender is on the card: no contact details, ever.

When a start date is chosen, cards say "Free from …". This needs no extra query: the results are already
limited to outfits free for those dates.

## The outfit page

`OutfitDetailView` (`search/ui`) renders everything a renter sees: gallery, prices, description,
measurements, condition, reviews, the lender. It takes its _actions_, _availability_ and _policies_ from the
caller, so:

- the public page passes the booking panel (or the owner's links), the availability calendar and the rental
  policies;
- the owner's preview passes a note instead of the booking panel.

The calendar (`AvailabilityCalendar`) and the policies (`RentalPolicies`) are bookings components; the page
in `src/app` composes them, so the `search` module never imports `bookings` (module boundaries are checked by
dependency-cruiser). The calendar shows `bookings.unavailableRanges` — held ranges only, never whose — and
the policies read `marketplacePolicy`, the same values booking and settlement use and snapshot onto every
booking.

## Categories

Categories are rows in `outfit_categories`, managed on `/admin/categories` (create, hide, show). Explore
lists the active ones as a strip; nothing in the code names a specific category. "Other occasionwear" was
added to the seed data in Phase 3.

## Known limits

- Ahmedabad only: localities are the only location filter, and there is no distance search.
- No public lender profile page; trust shows on cards and the outfit page.
- Search relevance is Postgres full-text plus trigram; no ranking by popularity or personalisation.
- The availability shown is the calendar; the request page applies the full rules (lead time, rental length,
  cleaning days).
