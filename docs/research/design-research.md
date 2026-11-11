# Design research (2026-11-11)

Background for [design-direction.md](../product/design-direction.md). This file records what was looked at
and why choices were made; the design direction document records the rules.

## Typography

All candidates below were checked in the `google/fonts` repository metadata. Every one is SIL OFL, so it can
be loaded with `next/font/google` and redistributed.

| Font | Axes | Italic | Verdict |
|---|---|---|---|
| **Bodoni Moda** | opsz 6–96, wght 400–900 | Yes | **Chosen display face.** High-contrast Didone in the lineage of fashion mastheads; optical sizing keeps hairlines usable at small sizes. |
| Newsreader | opsz 6–72, wght 200–800 | Yes | Runner-up display face: literary, excellent italics, less fashion. |
| Fraunces | opsz, wght, SOFT, WONK | Yes | Rejected: reads food/lifestyle and is common on startup sites. |
| Instrument Serif | 400 only | Yes | Rejected: a cliché of AI-generated landing pages. |
| Cormorant Garamond | wght 300–700 | Yes | Rejected: wedding-invitation cliché, too thin small. |
| Playfair Display | wght 400–900 | Yes | Rejected: the most over-used "elegant" Google font. |

| Sans | Axes | Italic | Verdict |
|---|---|---|---|
| **Schibsted Grotesk** | wght 400–900 | Yes | **Chosen body/UI face.** Designed for a news-media group: editorial pedigree, sturdy at small sizes, rarely seen. |
| Hanken Grotesk | wght 100–900 | Yes | Runner-up. |
| Instrument Sans | wdth 75–100, wght 400–700 | Yes | Considered for condensed captions. |
| Geist, Inter, Manrope, DM Sans | — | — | Rejected: read as framework or SaaS defaults. |

Gujarati companion: **Rasa** (Gujarati + Latin, wght 300–700, italic), a calligraphic text serif that sits
well beside Bodoni. Used for the wordmark companion "પેટી" and small bilingual labels only.

**Fontshare fonts (Satoshi, General Sans, Switzer, Zodiak…) were excluded.** Fontshare's own FAQ says its
closed-source fonts use the ITF Free Font License; third-party summaries say it forbids redistributing the
font files and self-hosting without written consent, which a public repository would do. PP Editorial New is
a commercial font and was excluded for the same reason.

## Layout patterns

Observed directly from markup: Toteme ships several crops (16:10, 9:16, 4:5, 5:7) per image and keeps a
centred wordmark with few menu items; Raw Mango and Sabyasachi use full-width banners with uppercase titles
and one call to action; Nicobar runs occasion rows, a journal block with a kicker label and attributed pull
quotes; By Rotation leads with a large headline and browsing by occasion. Several publications blocked
automated fetching, so the remaining patterns rest on general editorial practice. Patterns adopted, in our
own words:

1. Large serif headline overlapping an offset portrait image.
2. 12-column grid with deliberately empty columns and narrow caption columns.
3. Hairline rules instead of card borders, square corners, no shadows.
4. Numbered section indices in small caps with tabular numerals.
5. Caption-style metadata under listings (category · size · locality).
6. Fixed image ratios by role: 3:4 listings, 4:5 category tiles, 2:3 mobile heroes, 3:2 fabric bands.
7. Sticky split-screen product page: images scroll, booking column stays.
8. Filters as a single horizontal row of text controls, never a sidebar.
9. Ceremonies (mehendi, haldi, sangeet, wedding, reception) as a numbered contents page.
10. Lender notes as short attributed provenance ("worn once, at my sister's wedding").
11. Uneven listing rhythm (one large, two small) with occasional full-bleed textile bands.

No brand's assets, text or layouts are copied.

## Colour

Warm paper and sand backgrounds, ink text, burgundy as the brand colour, olive for dark sections and brass
as a sparing accent. Contrast ratios (WCAG 2.x) were computed for every text/background pair; the results and
the resulting usage rules are in [design-direction.md](../product/design-direction.md). Brass was chosen over
marigold because marigold fails contrast on light backgrounds (2.3:1) and reads as a wedding cliché; brass
reads as zari and temple lamps without the saturation.

## Photography licensing

| Source | Commercial use | Attribution | Key restrictions |
|---|---|---|---|
| Unsplash (free) | Yes | Not required | No selling unmodified copies; no compiling into a competing service; no rights to recognisable people, trademarks or artworks in images. **Unsplash+ images are a separate paid licence and are excluded.** |
| Pexels | Yes | Not required | No selling unaltered copies; no showing identifiable people in a bad light; no implying endorsement by people or brands shown; no redistribution on stock platforms. |
| Wikimedia Commons | Per file | Required | CC BY-SA requires attribution and share-alike for derivatives. |

Rules Peti follows as a result:

- Images are downloaded once by `scripts/fetch-images.ts`, resized, and committed with
  `public/images/ATTRIBUTION.md` (photographer, source, licence, date). No hotlinking.
- Listing photos are garment-only still lifes. Photos with people are used editorially only and are never
  presented as a lender, renter or reviewer.
- Photos from brand accounts are excluded to avoid implied association.
- The README states that images are not covered by the code licence.

## Name

"Peti" (પેટી / पेटी) is the trousseau trunk a bride takes to her new home. A quick web search found no
clothing brand by that name (only an unrelated B2B trade app). This is not a trademark clearance.
