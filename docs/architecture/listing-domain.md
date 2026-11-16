# Listing domain

The `listings` module (`src/modules/listings`) owns outfits as members list them: their details, prices,
photographs and status. Discovery reads them through the `search` module
([marketplace-discovery.md](./marketplace-discovery.md)); bookings lock them and check their status.

## Model

No new tables or columns were added in Phase 3. The existing model already covered it:

| Concept      | Where                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| The outfit   | `outfits` (owner, category, title, description, size, condition, money, locality, pickup address, status)       |
| Prices       | `outfit_price_options`: one row per rental length (2, 3, 5, 7 days); unused ones are deactivated, never deleted |
| Photographs  | `outfit_images`: storage key, alt text, dimensions, `sort_order`                                                |
| Measurements | `outfit_measurements`: one optional row, millimetres                                                            |
| Category     | `outfit_categories`: a tree (`parent_id`), audience, order, active flag; admin-managed                          |
| Availability | `calendar_holds` (bookings and owner blocks), shared with the booking module                                    |

Two decisions kept the schema as it was:

- **The cover is the first photograph** (lowest `sort_order`). "Make cover" rewrites the order in one
  transaction; there is no `is_cover` flag that could disagree with the order.
- **"What it cost new" is `retail_value_paise`**, and stays required. Database constraints cap the deposit
  and every price at it, and damage claims rely on it, so an optional value would have weakened rules the
  rest of the system depends on. The owner decided this in Phase 3.

## Status

`src/modules/listings/domain/outfit-status.ts` is the single source of transitions:

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve (admin)──▶ ACTIVE ◀──resume── PAUSED
  ▲                  │      │                             │ └──pause──────▲
  └────withdraw──────┘      └──reject (admin)──▶ REJECTED ─submit─▶ PENDING_REVIEW
ACTIVE / PAUSED ──content edited (system)──▶ PENDING_REVIEW
PENDING_REVIEW / ACTIVE / PAUSED ──suspend (admin)──▶ SUSPENDED ──reinstate──▶ PAUSED
anything but SUSPENDED ──archive──▶ ARCHIVED   (refused while the outfit has open bookings)
```

| Stored           | Shown to the owner | Renters see it |
| ---------------- | ------------------ | -------------- |
| `DRAFT`          | Draft              | No             |
| `PENDING_REVIEW` | Pending approval   | No             |
| `ACTIVE`         | Published          | Yes            |
| `REJECTED`       | Rejected           | No             |
| `PAUSED`         | Paused             | No             |
| `SUSPENDED`      | Unavailable        | No             |
| `ARCHIVED`       | (hidden)           | No             |

Labels live with the transitions (`outfitStatusLabel`); the one-line explanations on My outfits live in
`listings/ui/status.ts`. "Unavailable" in the brief maps to `SUSPENDED`; an outfit that is published but
fully booked is still _Published_, and its calendar shows the booked days.

Every status write is a compare-and-swap on the status the use case read, so an owner's edit can never undo
a suspension that happened while they were saving.

## Use cases (`application/use-cases.ts`)

| Use case                                           | Who           | Notes                                                                                                       |
| -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `createListing`                                    | Any member    | Always a `DRAFT`; the pickup address must be the member's own; category and locality active                 |
| `updateListing`                                    | Owner         | Name, description or category change on a live listing → back to review; prices do not                      |
| `addPhoto`                                         | Owner         | Up to 8; checked and re-encoded by the photo store; on a live listing → back to review; refused in the demo |
| `removePhoto`                                      | Owner         | A live, paused or in-review listing keeps at least one                                                      |
| `setCoverPhoto` _(Phase 3)_                        | Owner         | Reorders only; a live listing stays live                                                                    |
| `submitForReview`                                  | Owner         | Needs a photograph and a confirmed email and mobile                                                         |
| `withdrawFromReview`, `pause`, `resume`, `archive` | Owner         | Per the transitions above                                                                                   |
| `approve`, `reject`, `suspend`, `reinstate`        | Administrator | Reject and suspend need a note; every decision is audit-logged                                              |
| `getForEdit`, `listMine`                           | Owner         | `listMine` adds requests waiting, upcoming rentals and the next start date (Phase 3)                        |

Ownership is checked in one place (`owned()`): any other member gets `FORBIDDEN`, whatever the route. IDs,
prices and statuses from the browser are re-validated by the same Zod contract the form uses
(`listingFormSchema`), then by the money rules (`validateListingMoney`), then by database constraints.

## The owner's pages

| Route                         | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `/lend/outfits/new`           | Step 1: details. Creates the draft                             |
| `/lend/outfits/[id]/photos`   | Step 2: photographs and cover _(Phase 3)_                      |
| `/lend/outfits/[id]/preview`  | Step 3: the real card and outfit page, then submit _(Phase 3)_ |
| `/lend/outfits/[id]/edit`     | Everything, for an existing listing                            |
| `/lend/outfits/[id]/calendar` | Owner blocks (booking module)                                  |
| `/lend/dashboard`             | My outfits                                                     |

Status buttons are plain forms posting to `listingStatusAction`, so they work without JavaScript. A
`returnTo` field brings the owner back to the page they came from; only owner-area paths are accepted
(`ownerReturnPath`), so it cannot be used to redirect elsewhere.

The preview renders `OutfitDetailView` and `OutfitCardView` from the `search` module — the components renters
see — with the actions slot replaced by a note.

## Photographs and storage

`addPhoto` → `PhotoStore.save` → `sharpImageProcessor`: size limit, real type from the file's first bytes
(JPEG, PNG, WebP only), decompression-bomb limit, rotation, resize to 2000 px, JPEG re-encode (which strips
EXIF and location). Keys are `outfits/<outfitId>/<uuid>.jpg` and served publicly from `/api/files/…`;
condition-report photos live under a private prefix.

`allowsPhotoUploads(env)` is false in the public demo (`APP_ENV=demo`): it has no object storage and its
accounts' password is public. The use case refuses with `PHOTO_UPLOADS_DISABLED` after checking ownership and
before storing anything.

## Future attributes

Kept out on purpose, with where they would go:

| Later feature                      | Likely shape                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| More measurements, size charts     | Columns on `outfit_measurements` (already separate), or a per-category chart table               |
| Fabric, colour, brand as filters   | They exist as free text; normalise to lookup tables when filtering needs it                      |
| Condition grading, cleaning status | `condition_grade` exists; cleaning status belongs to bookings (per rental), not outfits          |
| Accessories                        | A child table of the outfit, each with its own condition                                         |
| Deeper category trees              | `outfit_categories.parent_id` already allows it; Explore matches a category and its children     |
| Category-specific attributes       | A small typed attribute table keyed by category — only once two categories need different fields |

The rule: no nullable column for an imagined feature, and no generic product-attribute engine until a real
need exists.
