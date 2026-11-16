# The two-sided marketplace experience

Peti owns no clothes. Every outfit belongs to a member, and the same members rent from each other. A Peti
account therefore does both: there are no separate owner and renter accounts, and nothing to switch.

This page describes how that shows up in the product (Phase 3). The step-by-step flows are in
[outfit-listing-workflow.md](./outfit-listing-workflow.md) and
[outfit-discovery-workflow.md](./outfit-discovery-workflow.md); the rules behind them are in
[listing-domain.md](../architecture/listing-domain.md) and
[marketplace-discovery.md](../architecture/marketplace-discovery.md).

## The two primary actions

| Action              | Who it is for                              | Where it goes                                                                     |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| **Explore outfits** | Someone looking for something to wear      | `/explore`                                                                        |
| **List an outfit**  | Someone with an outfit worth wearing again | Signed in: `/lend/outfits/new`. Signed out: `/lend`, which explains lending first |

They are the first two things in the header on every page:

- **Desktop:** "Explore outfits" leads the centred text links; "List an outfit" is the only filled button in
  the header, before the account link.
- **Phones:** a slim two-link bar sits under the header, so neither action hides inside the menu. The menu
  sheet also leads with them.
- **Home:** the hero offers both side by side.
- **Explore:** a line under the introduction invites visitors to list their own.

The words are deliberate. Peti is a rental marketplace: never "Sell", "Products", "Add product" or
"Wearables". People _list_ an outfit and _rent_ one; they _lend_, and they _earn_.

## One account area

Renting and lending share one bar of tabs, whichever page you are on:

| Tab                | Route              | Also covers                                       |
| ------------------ | ------------------ | ------------------------------------------------- |
| My rentals         | `/account/rentals` | Each rental's page                                |
| My outfits         | `/lend/dashboard`  | The listing steps and editing (`/lend/outfits/…`) |
| Rental requests    | `/lend/requests`   | Past rentals (`/lend/history`)                    |
| Earnings           | `/lend/earnings`   |                                                   |
| Saved              | `/account/saved`   |                                                   |
| Profile & settings | `/account`         | Notifications, addresses, reviews                 |

Sections spread over several pages get a quiet second row of links. The routes did not change, so nothing
that linked to them broke.

## What makes it feel like one marketplace

- **The owner sees what renters see.** The listing preview renders the real Explore card and the real outfit
  page, not an imitation.
- **The same outfit page serves everyone.** A renter sees the request button; the owner sees "This is your
  outfit" with links to manage it. Nobody can request their own outfit — the page does not offer it and the
  booking rules refuse it.
- **Trust travels with the outfit.** Every card names the lender with their rating once reviewed, their
  completed rentals, or "New lender".
- **Status in plain words.** My outfits says _Draft_, _Pending approval_, _Published_, _Rejected_, _Paused_
  or _Unavailable_, and one sentence about what that means.

## Design

The pages follow [design-direction.md](./design-direction.md): a fashion publication that happens to be a
marketplace. Photography carries the colour; Bodoni headlines with one italic word; hairlines, not cards;
square corners and no shadows; an index bar instead of a dashboard sidebar. Phase 3 kept that identity and
added image-led rows for My outfits, a gallery and a calendar on the outfit page, and a dashed drop zone for
photographs.

Screenshots: `docs/screenshots/` (`explore-*`, `outfit-*`, `list-*`, `my-outfits-*`).

## Out of scope

Buying and selling, company inventory, chat, recommendations, virtual try-on, detailed garment measurement
systems and size charts. See the Phase 3 report for the product gaps that remain.
