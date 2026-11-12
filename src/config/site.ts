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

export const primaryNav = [
  { href: "/explore", label: "Explore" },
  { href: "/lend", label: "Lend an outfit" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/trust-and-safety", label: "Trust & safety" },
] as const;

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
