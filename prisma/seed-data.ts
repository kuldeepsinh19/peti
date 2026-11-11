/**
 * Demonstration data. Every person and listing here is fictional; nothing represents real users,
 * real rentals or real business activity. Photographs are licensed stock (public/images/ATTRIBUTION.md).
 */

export const localities = [
  "Satellite",
  "Bodakdev",
  "Vastrapur",
  "Prahlad Nagar",
  "Thaltej",
  "Navrangpura",
  "Ellisbridge",
  "Ambawadi",
  "Paldi",
  "Maninagar",
  "Bopal",
  "Gota",
  "Chandkheda",
  "Naranpura",
  "Science City",
].map((name) => ({ name, slug: name.toLowerCase().replace(/\s+/g, "-") }));

export const categories = [
  {
    slug: "sherwani",
    name: "Sherwanis",
    audience: "MEN",
    description: "Knee-length coats for the groom and his family.",
  },
  {
    slug: "bandhgala",
    name: "Jodhpuri & bandhgala",
    audience: "MEN",
    description: "Close-collared suits for receptions.",
  },
  {
    slug: "indo-western",
    name: "Indo-western",
    audience: "MEN",
    description: "Draped and asymmetric cuts for sangeet nights.",
  },
  {
    slug: "suits-tuxedos",
    name: "Suits & tuxedos",
    audience: "MEN",
    description: "Western formalwear for cocktail evenings.",
  },
  {
    slug: "kurta-sets",
    name: "Kurta sets",
    audience: "MEN",
    description: "Embroidered kurtas for mehendi and haldi.",
  },
  {
    slug: "lehenga",
    name: "Lehengas",
    audience: "WOMEN",
    description: "Bridal, sangeet and reception lehengas.",
  },
  {
    slug: "saree",
    name: "Sarees",
    audience: "WOMEN",
    description: "Banarasi, Kanchipuram, tissue and designer sarees.",
  },
  {
    slug: "anarkali-gowns",
    name: "Anarkalis & gowns",
    audience: "WOMEN",
    description: "Floor-length silhouettes.",
  },
  {
    slug: "chaniya-choli",
    name: "Chaniya cholis",
    audience: "WOMEN",
    description: "For nine nights of Navratri garba.",
  },
] as const;

export const demoPassword = "peti-demo-password";

export const users = [
  {
    key: "admin",
    name: "Peti Admin",
    email: "admin@peti.local",
    phone: "+919000000001",
    role: "admin" as const,
  },
  {
    key: "aarav",
    name: "Aarav Desai",
    email: "aarav@peti.local",
    phone: "+919000000002",
    role: "user" as const,
  },
  {
    key: "meera",
    name: "Meera Shah",
    email: "meera@peti.local",
    phone: "+919000000003",
    role: "user" as const,
  },
  {
    key: "kabir",
    name: "Kabir Patel",
    email: "kabir@peti.local",
    phone: "+919000000004",
    role: "user" as const,
  },
  {
    key: "isha",
    name: "Isha Mehta",
    email: "isha@peti.local",
    phone: "+919000000005",
    role: "user" as const,
  },
  {
    key: "rohan",
    name: "Rohan Trivedi",
    email: "rohan@peti.local",
    phone: "+919000000006",
    role: "user" as const,
  },
];

type Occasion = "MEHENDI" | "HALDI" | "SANGEET" | "WEDDING" | "RECEPTION" | "ENGAGEMENT" | "NAVRATRI";

export interface DemoOutfit {
  owner: string;
  locality: string;
  category: (typeof categories)[number]["slug"];
  title: string;
  description: string;
  brand?: string;
  colour: string;
  fabric: string;
  size: "XS" | "S" | "M" | "L" | "XL" | "XXL" | "FREE_SIZE";
  condition: "NEW_WITH_TAGS" | "EXCELLENT" | "GOOD";
  conditionNotes: string;
  retailRupees: number;
  depositRupees: number;
  prices: Array<[days: number, rupees: number]>;
  occasions: Occasion[];
  measurementsCm: Partial<
    Record<
      "chest" | "waist" | "hip" | "shoulder" | "sleeve" | "length" | "bottomWaist" | "bottomLength",
      number
    >
  >;
  photos: Array<{ file: string; alt: string }>;
  status?: "ACTIVE" | "PENDING_REVIEW" | "DRAFT";
}

export const outfits: DemoOutfit[] = [
  {
    owner: "aarav",
    locality: "Satellite",
    category: "sherwani",
    title: "Antique gold brocade sherwani",
    description:
      "Heavy brocade with a raised paisley weave and self-covered buttons. Bought for my wedding in 2024 and worn for one evening. Comes with matching churidar; stole not included.",
    colour: "Antique gold",
    fabric: "Silk brocade",
    size: "L",
    condition: "EXCELLENT",
    conditionNotes:
      "Professionally dry-cleaned. A tiny pull on the inside of the left cuff, not visible when worn.",
    retailRupees: 38_000,
    depositRupees: 8_000,
    prices: [
      [3, 4_500],
      [5, 6_500],
    ],
    occasions: ["WEDDING", "RECEPTION"],
    measurementsCm: { chest: 106, waist: 96, shoulder: 47, sleeve: 63, length: 112 },
    photos: [
      {
        file: "ornate-sherwani-hanger.jpg",
        alt: "Gold brocade sherwani on a wooden hanger against a jali screen",
      },
    ],
  },
  {
    owner: "aarav",
    locality: "Satellite",
    category: "sherwani",
    title: "Ivory sherwani with maroon velvet stole",
    description:
      "Ivory raw-silk sherwani with fine thread-work, paired with a maroon velvet stole embroidered in gold. Worn to my brother's wedding.",
    colour: "Ivory and maroon",
    fabric: "Raw silk, velvet",
    size: "M",
    condition: "EXCELLENT",
    conditionNotes: "No known flaws. Stole has been steamed and stored flat.",
    retailRupees: 32_000,
    depositRupees: 7_000,
    prices: [
      [3, 3_800],
      [5, 5_200],
    ],
    occasions: ["WEDDING", "ENGAGEMENT"],
    measurementsCm: { chest: 102, waist: 92, shoulder: 45, sleeve: 62, length: 110 },
    photos: [{ file: "brown-jodhpuri.jpg", alt: "Ivory sherwani hanging beside a maroon velvet stole" }],
  },
  {
    owner: "kabir",
    locality: "Bodakdev",
    category: "sherwani",
    title: "White chikankari sherwani with maroon dupatta",
    description:
      "Hand chikankari on georgette with a printed maroon dupatta. Light enough for a day wedding in Ahmedabad heat.",
    colour: "White",
    fabric: "Georgette",
    size: "M",
    condition: "GOOD",
    conditionNotes: "Faint mark on the inner hem (shown in photographs). Otherwise excellent.",
    retailRupees: 24_000,
    depositRupees: 5_000,
    prices: [
      [2, 2_400],
      [3, 3_000],
      [5, 4_200],
    ],
    occasions: ["WEDDING", "MEHENDI"],
    measurementsCm: { chest: 100, waist: 90, shoulder: 45, sleeve: 61, length: 108 },
    photos: [
      {
        file: "white-sherwani-dupatta.jpg",
        alt: "White chikankari sherwani with a maroon dupatta on a hanger outdoors",
      },
    ],
  },
  {
    owner: "kabir",
    locality: "Bodakdev",
    category: "sherwani",
    title: "Ivory chevron sherwani with pearl mala",
    description: "Chevron thread-work in ivory and blush. Pearl mala included; safa available on request.",
    colour: "Ivory",
    fabric: "Silk blend",
    size: "L",
    condition: "EXCELLENT",
    conditionNotes: "Worn once. No known flaws.",
    retailRupees: 29_000,
    depositRupees: 6_000,
    prices: [
      [3, 3_500],
      [5, 4_800],
      [7, 6_000],
    ],
    occasions: ["WEDDING", "RECEPTION", "ENGAGEMENT"],
    measurementsCm: { chest: 108, waist: 98, shoulder: 47, sleeve: 63, length: 111 },
    photos: [
      {
        file: "sherwani-on-branch.jpg",
        alt: "Ivory chevron sherwani with a pearl mala hanging from a branch",
      },
    ],
  },
  {
    owner: "meera",
    locality: "Vastrapur",
    category: "sherwani",
    title: "Champagne threadwork sherwani",
    description:
      "Champagne sherwani with dense resham work on the placket and cuffs. My husband's reception outfit.",
    colour: "Champagne",
    fabric: "Silk",
    size: "XL",
    condition: "EXCELLENT",
    conditionNotes: "No known flaws.",
    retailRupees: 34_000,
    depositRupees: 7_000,
    prices: [
      [3, 4_000],
      [5, 5_500],
    ],
    occasions: ["RECEPTION", "WEDDING"],
    measurementsCm: { chest: 112, waist: 102, shoulder: 48, sleeve: 64, length: 112 },
    photos: [{ file: "sherwani-outdoors.jpg", alt: "Champagne sherwani on a mannequin against the sky" }],
  },
  {
    owner: "meera",
    locality: "Vastrapur",
    category: "sherwani",
    title: "Pearl-white sherwani with zari buttons",
    description: "Classic pearl-white sherwani with gold zari buttons and subtle tone-on-tone embroidery.",
    colour: "Pearl white",
    fabric: "Silk",
    size: "M",
    condition: "NEW_WITH_TAGS",
    conditionNotes: "Never worn; tags attached.",
    retailRupees: 27_000,
    depositRupees: 6_000,
    prices: [
      [3, 3_600],
      [5, 5_000],
    ],
    occasions: ["WEDDING", "ENGAGEMENT"],
    measurementsCm: { chest: 101, waist: 91, shoulder: 45, sleeve: 62, length: 109 },
    photos: [
      { file: "white-sherwani-necklace.jpg", alt: "Pearl-white sherwani on a hanger before a golden door" },
    ],
  },
  {
    owner: "meera",
    locality: "Vastrapur",
    category: "lehenga",
    title: "Silver-grey zardozi bridal lehenga",
    description:
      "Silver-grey lehenga with zardozi and sequin work across a twelve-panel skirt, with blouse and net dupatta. Can-can included.",
    colour: "Silver grey",
    fabric: "Raw silk, net",
    size: "S",
    condition: "EXCELLENT",
    conditionNotes: "Worn for my wedding reception. Two sequins replaced by the original tailor.",
    retailRupees: 1_15_000,
    depositRupees: 20_000,
    prices: [
      [3, 12_000],
      [5, 16_000],
    ],
    occasions: ["WEDDING", "RECEPTION"],
    measurementsCm: { chest: 86, waist: 68, hip: 96, bottomWaist: 70, bottomLength: 104 },
    photos: [
      {
        file: "bridal-lehenga-display.jpg",
        alt: "Silver-grey bridal lehenga skirt displayed outdoors on a stand",
      },
    ],
  },
  {
    owner: "isha",
    locality: "Prahlad Nagar",
    category: "lehenga",
    title: "Dusty-rose bridal lehenga with net dupatta",
    description:
      "Dusty-rose lehenga with gota-patti borders and a soft net dupatta. Ideal for a day wedding.",
    colour: "Dusty rose",
    fabric: "Georgette, net",
    size: "M",
    condition: "EXCELLENT",
    conditionNotes: "No known flaws.",
    retailRupees: 68_000,
    depositRupees: 12_000,
    prices: [
      [3, 7_500],
      [5, 9_800],
    ],
    occasions: ["WEDDING", "SANGEET", "ENGAGEMENT"],
    measurementsCm: { chest: 90, waist: 72, hip: 100, bottomWaist: 74, bottomLength: 106 },
    photos: [
      { file: "lehenga-palm.jpg", alt: "Dusty-rose lehenga hanging from a palm tree with its net dupatta" },
    ],
  },
  {
    owner: "isha",
    locality: "Prahlad Nagar",
    category: "lehenga",
    title: "Crimson bridal lehenga, gold border",
    description:
      "Crimson bridal lehenga with a heavy gold border and kiran lace. Worn once for my wedding pheras.",
    colour: "Crimson",
    fabric: "Silk",
    size: "S",
    condition: "EXCELLENT",
    conditionNotes: "Professionally cleaned and stored in muslin.",
    retailRupees: 92_000,
    depositRupees: 18_000,
    prices: [
      [3, 10_500],
      [5, 14_000],
    ],
    occasions: ["WEDDING"],
    measurementsCm: { chest: 84, waist: 66, hip: 94, bottomWaist: 68, bottomLength: 103 },
    photos: [{ file: "lehenga-skirt-spread.jpg", alt: "Crimson lehenga skirt and gold border spread out" }],
  },
  {
    owner: "isha",
    locality: "Prahlad Nagar",
    category: "saree",
    title: "Teal Banarasi silk saree with zari butis",
    description:
      "Pure Banarasi katan silk in teal with gold zari butis and an elephant-motif pallu. Blouse piece unstitched.",
    colour: "Teal",
    fabric: "Katan silk",
    size: "FREE_SIZE",
    condition: "EXCELLENT",
    conditionNotes: "No known flaws.",
    retailRupees: 26_000,
    depositRupees: 5_000,
    prices: [
      [2, 2_200],
      [3, 2_800],
    ],
    occasions: ["WEDDING", "RECEPTION", "ENGAGEMENT"],
    measurementsCm: { length: 550 },
    photos: [
      {
        file: "banarasi-saree.jpg",
        alt: "Teal Banarasi silk saree folded on a table beside brass ornaments",
      },
    ],
  },
  {
    owner: "kabir",
    locality: "Bodakdev",
    category: "sherwani",
    title: "Cream sherwani with floral door motif",
    description: "Cream sherwani with ivory floral embroidery. Submitted for review — not yet published.",
    colour: "Cream",
    fabric: "Silk",
    size: "L",
    condition: "EXCELLENT",
    conditionNotes: "No known flaws.",
    retailRupees: 30_000,
    depositRupees: 6_000,
    prices: [[3, 3_700]],
    occasions: ["WEDDING"],
    measurementsCm: { chest: 107, waist: 97, length: 110 },
    photos: [{ file: "white-sherwani-necklace.jpg", alt: "Cream sherwani on a hanger" }],
    status: "PENDING_REVIEW",
  },
];
