# Listing an outfit

How a member makes an outfit they own available to rent, from the first click to a published listing.
The rules behind each step are in [listing-domain.md](../architecture/listing-domain.md).

## Before you start

- **A signed-in account.** Any account can list; there is no separate owner account.
- **A pickup address** (`/account/addresses`). Renters only ever see its locality; the full address is shared
  once a booking is paid. Without one, the form explains this and links to the address page.
- **A confirmed email and mobile number** are needed to _submit_ for review, not to prepare a listing. My
  outfits says so when they are missing.

## The three steps

The steps are separate pages with a step bar ("01 Details · 02 Photographs · 03 Preview & submit"). Once the
draft exists every step links to the others, so the owner can go back and change anything before submitting.

### 1. Details — `/lend/outfits/new`

The essentials first:

| Field                    | Rule                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Outfit name              | 5–120 characters                                                                                              |
| Category                 | One of the active categories (managed by administrators)                                                      |
| Size                     | XS–XXXL or Free size                                                                                          |
| Description              | At least 30 characters: when it was worn, what is included, how it fits                                       |
| Occasions it suits       | At least one                                                                                                  |
| Condition                | New with tags, Excellent, Good (default) or Fair                                                              |
| Rental price             | At least one of 2, 3, 5 or 7 days; each ₹200 or more, at most what it cost new; a longer rental never cheaper |
| What it cost new         | Required: it caps the deposit and the prices, and protects the owner in a damage claim                        |
| Refundable deposit       | ₹500 up to what it cost new; the form suggests 20–30%                                                         |
| Pickup address, locality | The owner's own address; the locality is what renters see                                                     |

The form shows what the owner would receive for the cheapest price after Peti's 15% fee, as they type.

Under **More about the outfit (optional)**: colour, fabric, designer or label, condition notes, measurements
in centimetres, fit notes and cleaning days (default 1). The section opens by itself if one of its fields has
an error. Measurements are optional but help: renters can filter by them.

Saving creates a **Draft** that only the owner can see and leads to step 2.

### 2. Photographs — `/lend/outfits/[id]/photos`

- Drop several photographs or choose them from the device: JPEG, PNG or WebP, up to 8 per listing.
- Each one shows a preview and its stage: waiting, preparing, uploading, added, or not added with the reason.
- Phone photographs are resized in the browser before upload; the server checks every file's real type,
  strips its metadata (including location) and re-encodes it.
- The first photograph is the **cover** — what renters see first in Explore. "Make cover" moves any
  photograph to the front.
- "Remove" deletes a photograph. A listing that is published or in review keeps at least one.
- "Continue to preview" appears once there is a photograph.

In the public demo, photographs cannot be uploaded (the demo has no file storage); the page says so.

### 3. Preview & submit — `/lend/outfits/[id]/preview`

The preview renders the **real** Explore card and outfit page, with a dashed note where renters will see the
request button. From here the owner can edit the details or the photographs, or **Submit for review**.

Submitting needs a photograph and a confirmed email and mobile number. The owner lands on My outfits with
"Submitted for review": a Peti administrator checks every listing before renters can see it, and the owner
is notified when it is published.

## After submitting

| Status shown     | Stored as        | What it means                                       | What the owner can do                     |
| ---------------- | ---------------- | --------------------------------------------------- | ----------------------------------------- |
| Draft            | `DRAFT`          | Only the owner can see it                           | Edit, add photographs, preview and submit |
| Pending approval | `PENDING_REVIEW` | Waiting for an administrator                        | Withdraw (back to Draft)                  |
| Published        | `ACTIVE`         | Renters can find and request it                     | Pause, edit, availability, view requests  |
| Rejected         | `REJECTED`       | The reviewer asked for changes; their note is shown | Edit and submit again                     |
| Paused           | `PAUSED`         | Hidden from renters; bookings already made go ahead | Resume, edit, availability                |
| Unavailable      | `SUSPENDED`      | Suspended by Peti and hidden from everyone          | Contact the administrators                |

Editing a published or paused listing's name, description or category, or adding a photograph, sends it
back to review. Changing prices, the deposit, availability or the cover does not.

## My outfits — `/lend/dashboard`

One row per outfit: cover, category, name, lowest price and its length, the status with its explanation,
the reviewer's note when changes were requested, requests waiting for an answer, upcoming rentals with the
next start date, and only the actions its status allows. Pausing and resuming stay on the page and say what
happened. An account with no outfits gets an invitation to list a first one.

## What can never happen

- Another member editing, pausing, photographing or previewing your outfit (refused on the server).
- A listing reaching renters without an administrator's approval.
- A listing change cancelling, re-pricing or otherwise touching a booking already made (bookings snapshot
  their price and terms when requested).
- Archiving an outfit that still has open bookings.
