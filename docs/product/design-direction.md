# Design direction

Peti should feel like **a fashion publication that happens to be a marketplace**: editorial typography,
photography given room, and the plain, careful tone of a well-run ledger wherever money or trust is involved.
Research behind these choices: [design-research.md](../research/design-research.md). The living reference is
`/dev/design-system` (local and test environments only). Tokens live in `src/app/globals.css`.

## Principles

1. **Type does the work.** Hierarchy comes from Bodoni Moda at display sizes, not from boxes, colour or
   icons.
2. **Rules, not cards.** Hairline rules and whitespace separate content. Square corners, no shadows, no
   gradients, no glass.
3. **Asymmetry with intent.** A 12-column grid with deliberately empty columns; headlines overlap images;
   listings use an uneven rhythm.
4. **Photography is the colour.** The palette stays quiet so garments carry the colour.
5. **Plain about trust and money.** Where the user decides something with money or risk, the layout becomes a
   ledger: labels, figures, no flourish.

## Typography

| Role                                                    | Face                                       | Token / utility                                                |
| ------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Display, headlines, prices, occasion names              | Bodoni Moda (variable, opsz 6–96, italics) | `font-display`, `text-display-{sm,md,lg,xl}`, `display-italic` |
| Body and interface                                      | Schibsted Grotesk                          | `font-sans` (default)                                          |
| Gujarati accents (wordmark companion, bilingual labels) | Rasa                                       | `font-gujarati` with `lang="gu"`                               |
| Labels, metadata, table headers                         | Schibsted Grotesk, small capitals          | `eyebrow`                                                      |
| Figures in tables and prices                            | tabular lining numerals                    | `numeral`                                                      |

Display sizes are fluid (`clamp`) so one class works from 390 px to 1440 px. Headlines use `text-wrap:
balance`. Italic is reserved for one emphasised word per headline. Body copy never goes below 16 px; captions
use `text-caption` (13 px) and only `stone` or darker colours.

Rejected: Inter, Roboto, Geist, Playfair Display, Cormorant, Instrument Serif and Fraunces (over-used), and
Fontshare faces (licence forbids redistribution in a public repository).

## Colour

| Token                            | Hex                               | Use                                             |
| -------------------------------- | --------------------------------- | ----------------------------------------------- |
| `paper`                          | `#FBF8F2`                         | Page background                                 |
| `ivory`                          | `#F6F1E7`                         | Alternate bands (search strip, notices)         |
| `sand`                           | `#E6D9C2`                         | Image placeholders, panels                      |
| `sand-deep`                      | `#CDB993`                         | Decorative only — never text                    |
| `ink`                            | `#1E1B18`                         | Primary text, strong rules, footer              |
| `graphite`                       | `#4A443E`                         | Secondary text                                  |
| `stone`                          | `#6F675E`                         | Captions on paper/ivory only (fails AA on sand) |
| `burgundy`                       | `#6B1F2A`                         | Brand, links, primary buttons                   |
| `olive` / `olive-deep`           | `#5B5E3F` / `#454830`             | Accent; dark editorial sections                 |
| `brass`                          | `#B0832F`                         | Rules, numerals, large display text only        |
| `brass-deep`                     | `#86601A`                         | Brass when used at body size                    |
| `success` / `warning` / `danger` | `#3F5A2C` / `#86601A` / `#8F1D1D` | Status text and outlines                        |

Contrast (WCAG 2.x): ink on paper 16.2:1, graphite on paper 9.1:1, burgundy on paper 10.7:1, stone on paper
5.2:1 (but 4.0:1 on sand — so never), brass on paper 3.2:1 (large text only), paper on burgundy 10.7:1.
Status is never conveyed by colour alone: every tag carries text.

## Layout

- **Grid:** `page-grid` — 4 columns on mobile, 12 from 1024 px, gutter `--spacing-gutter` (16–40 px fluid).
  Content commonly starts in column 2 or 5 and leaves columns empty.
- **Page width:** `max-w-page` (1440 px) with `page-x` side padding; long-form copy at `max-w-prose`.
- **Vertical rhythm:** sections separated by `--spacing-section` (64–144 px fluid).
- **Image ratios by role:** listings 3:4, category tiles 4:5, mobile hero 2:3, textile bands wide crops.
- **Breakpoints:** Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Design and test at 390 px and
  1440 px.
- **Section index:** numbered small-caps labels (`SectionIndex`: "02 — Contents") open each section.

## Components (`src/shared/ui`)

| Component                                                                               | Pattern                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `ButtonLink`                                                                  | Variants: `primary` (burgundy fill), `secondary` (ink outline), `quiet` (underlined text), `link`, `danger` (outline), `inverse` (on dark sections). Sizes `sm` 36 px, `md` 44 px, `lg` 56 px. Pending state shows a square spinner and `aria-busy`. |
| `TextField`, `TextAreaField`, `SelectField`, `CheckboxField`, `Fieldset`, `FormMessage` | Small-caps label above a single bottom rule; hint and error wired with `aria-describedby`; errors in `danger` with `role="alert"`.                                                                                                                   |
| `Modal`                                                                                 | Centred panel for confirmations (Base UI Dialog: focus trap, Escape, scroll lock).                                                                                                                                                                   |
| `Sheet`                                                                                 | Bottom sheet on mobile, right-hand panel on desktop; used for filters and the mobile menu.                                                                                                                                                           |
| `Ledger`                                                                                | Tables with hairline rows and small-caps headers; collapses to labelled stacks on mobile.                                                                                                                                                            |
| `DefinitionList`                                                                        | Label/value colophon, used for price breakdowns and booking facts.                                                                                                                                                                                   |
| `Tag`                                                                                   | Outlined small-caps status label.                                                                                                                                                                                                                    |
| `Notice`                                                                                | Left-ruled note on ivory for contextual information.                                                                                                                                                                                                 |
| `EmptyState`                                                                            | Serif italic line, one sentence, at most one action.                                                                                                                                                                                                 |
| `Skeleton`, `ListingGridSkeleton`                                                       | Sand blocks matching the final layout.                                                                                                                                                                                                               |
| `PageHeader`, `SectionIndex`, `Rule`, `Eyebrow`, `Page`                                 | Layout primitives.                                                                                                                                                                                                                                   |

## Navigation

- Public: wordmark left, four text links centred, account links right; a top strip carries the tagline. On
  mobile, a "Menu" button opens a numbered sheet.
- Account, lending and admin areas: a top **index bar** of text links (never a sidebar) under a page header,
  and ledger tables for lists.

## Motion

Only opacity/translate reveals under 200 ms, image scale on hover (1.02 over 700 ms) and sheet slides. Every
animation is disabled under `prefers-reduced-motion`.

## Photography

- Licensed stock only (Pexels, free Unsplash), downloaded once and committed with
  [ATTRIBUTION.md](../../public/images/ATTRIBUTION.md); never hotlinked.
- Demo listings use **garment-only** photographs. Editorial photographs with people are captioned as such and
  never presented as a lender, renter or reviewer.
- Every image has meaningful `alt` text, or `alt=""` when purely decorative (textile bands).

## Voice

Short, specific, unhurried. Say exactly what is checked and what is not. Use rupees with Indian grouping
(₹1,25,000). Name ceremonies the way people in Gujarat do (mehendi, haldi, sangeet, Navratri). Never invent
testimonials, numbers of users or "trusted by" claims.
