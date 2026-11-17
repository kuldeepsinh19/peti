/** Static site configuration: navigation, launch city and editorial copy that is not business data. */
export const site = {
  name: "Peti",
  nameGujarati: "પેટી",
  tagline: "Peer-to-peer occasionwear, Ahmedabad",
  description:
    "Rent sherwanis, Jodhpuri suits, lehengas and designer sarees from people in Ahmedabad who wore them once — or lend yours and let it earn.",
  launchCity: "Ahmedabad",
  repositoryUrl: "https://github.com/kuldeepsinh19/peti",
} as const;

/**
 * Versions of the terms and privacy notice a member accepts at sign-up (stored on the account). Bump when
 * either document changes; the pages show the same date.
 */
export const legalDocuments = {
  version: "2026-11-12",
  updated: "12 November 2026",
} as const;

export const primaryNav = [
  { href: "/explore", label: "Explore outfits" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/trust-and-safety", label: "Trust & safety" },
] as const;

/**
 * The marketplace's second primary action. Signed-in members go straight to the listing flow; visitors
 * first see what lending involves.
 */
export const listAnOutfit = {
  label: "List an outfit",
  href: (signedIn: boolean) => (signedIn ? "/lend/outfits/new" : "/lend"),
} as const;

/** Ceremonies used as a browsing facet. Values match the `Occasion` enum in prisma/schema.prisma. */
export const occasions = [
  { value: "MEHENDI", label: "Mehendi", note: "Greens, yellows, light cottons and georgettes" },
  { value: "HALDI", label: "Haldi", note: "Turmeric yellows you will not mind staining" },
  { value: "SANGEET", label: "Sangeet", note: "Indo-western cuts and lehengas that move" },
  { value: "WEDDING", label: "Wedding", note: "Sherwanis, bridal and heavy lehengas, Banarasi silks" },
  { value: "RECEPTION", label: "Reception", note: "Bandhgalas, tuxedos and evening sarees" },
  { value: "ENGAGEMENT", label: "Engagement", note: "Pastels, threadwork, lighter jewellery" },
  { value: "NAVRATRI", label: "Navratri", note: "Chaniya cholis and kediyus for nine nights" },
] as const;

export type OccasionValue = (typeof occasions)[number]["value"];

/**
 * The shared, fictional accounts of the public demo (APP_ENV=demo), created by `pnpm db:seed`. Their
 * password is published on purpose; nothing real is ever stored in the demo.
 */
export const demoAccounts = {
  password: "peti-demo-password",
  accounts: [
    { email: "rohan@peti.local", role: "Renter" },
    { email: "aarav@peti.local", role: "Owner" },
    { email: "meera@peti.local", role: "Owner" },
  ],
} as const;
