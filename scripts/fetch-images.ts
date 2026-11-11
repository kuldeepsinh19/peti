/**
 * Downloads the curated, licence-checked photo set once, writes resized derivatives into the repository
 * and regenerates public/images/ATTRIBUTION.md. Never hotlink: the app only serves the local copies.
 *
 *   pnpm images:fetch            # download missing files
 *   pnpm images:fetch --force    # re-download everything
 *
 * Licence rules (see docs/research/design-research.md):
 * - Pexels License and the (free) Unsplash License allow commercial use without attribution; we credit
 *   anyway. Unsplash+ images are a different, paid licence and must never be added here.
 * - Listing (seed) photos are garment-only. Photos showing people are editorial only and must never be
 *   presented as a lender, renter or reviewer. No photos from brand accounts.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type Source = "pexels" | "unsplash";
type Use = "editorial" | "listing" | "texture";

interface Photo {
  file: string;
  source: Source;
  id: string;
  photographer: string;
  page: string;
  description: string;
  use: Use;
}

const photos: Photo[] = [
  // Editorial still lifes and portraits (public/images/editorial)
  {
    file: "hero-cream-sherwani.jpg",
    source: "unsplash",
    id: "iiVy7LJvBnw",
    photographer: "ARTO SURAJ",
    page: "https://unsplash.com/photos/iiVy7LJvBnw",
    description: "Cream sherwani hung before a golden door with flowers",
    use: "editorial",
  },
  {
    file: "jodhpuri-courtyard.jpg",
    source: "pexels",
    id: "5724384",
    photographer: "Abhishek Shekhawat",
    page: "https://www.pexels.com/photo/a-man-in-a-jodhpuri-suit-5724384/",
    description: "Jodhpuri suit in a palace courtyard",
    use: "editorial",
  },
  {
    file: "black-bandhgala.jpg",
    source: "pexels",
    id: "12963970",
    photographer: "Abhishek Shekhawat",
    page: "https://www.pexels.com/photo/a-man-in-jodhpuri-suit-12963970/",
    description: "Black bandhgala with a red pocket square",
    use: "editorial",
  },
  {
    file: "blue-suit-station.jpg",
    source: "pexels",
    id: "10870285",
    photographer: "Abhishek Shekhawat",
    page: "https://www.pexels.com/photo/man-in-blue-suit-wearing-sunglasses-standing-beside-a-metal-railing-10870285/",
    description: "Blue suit at a metro station",
    use: "editorial",
  },
  {
    file: "lehenga-back-view.jpg",
    source: "pexels",
    id: "29251325",
    photographer: "Imad Clicks",
    page: "https://www.pexels.com/photo/elegant-indian-bridal-lehenga-back-view-29251325/",
    description: "Bridal lehenga seen from behind",
    use: "editorial",
  },
  {
    file: "golden-saree-tree.jpg",
    source: "pexels",
    id: "37054322",
    photographer: "Satyam Pixels",
    page: "https://www.pexels.com/photo/elegant-woman-in-traditional-saree-by-tree-37054322/",
    description: "Golden saree beside a tree",
    use: "editorial",
  },
  {
    file: "pink-lehenga-studio.jpg",
    source: "pexels",
    id: "16803130",
    photographer: "Pratik Patil",
    page: "https://www.pexels.com/photo/studio-shot-of-a-young-woman-wearing-a-pink-lehenga-dress-16803130/",
    description: "Pink lehenga, studio portrait",
    use: "editorial",
  },
  // Textile details (public/images/textures)
  {
    file: "red-embroidery.jpg",
    source: "pexels",
    id: "37975932",
    photographer: "Ms. Parikh",
    page: "https://www.pexels.com/photo/intricate-red-indian-textile-with-embroidery-37975932/",
    description: "Red textile with dense embroidery",
    use: "texture",
  },
  {
    file: "kanchipuram-silk.jpg",
    source: "pexels",
    id: "10317113",
    photographer: "Sharath G.",
    page: "https://www.pexels.com/photo/pattern-on-purple-rug-10317113/",
    description: "Kanchipuram silk weave close-up",
    use: "texture",
  },
  {
    file: "sherwani-embroidery.jpg",
    source: "pexels",
    id: "28802603",
    photographer: "Bonaventure Fernandez",
    page: "https://www.pexels.com/photo/elegant-indian-groom-in-traditional-sherwani-28802603/",
    description: "Embroidered sherwani detail",
    use: "texture",
  },
  {
    file: "beadwork.jpg",
    source: "pexels",
    id: "8751904",
    photographer: "Tamanna Rumee",
    page: "https://www.pexels.com/photo/fabric-with-embroidery-and-beads-8751904/",
    description: "Bead and sequin embroidery",
    use: "texture",
  },
  {
    file: "embroidered-strips.jpg",
    source: "unsplash",
    id: "xLQEPpuonWY",
    photographer: "Richard Williams",
    page: "https://unsplash.com/photos/xLQEPpuonWY",
    description: "Strips of embroidered fabric",
    use: "texture",
  },
  // Garment-only photos for seeded listings (prisma/seed-assets)
  {
    file: "brown-jodhpuri.jpg",
    source: "pexels",
    id: "2060241",
    photographer: "viresh studio",
    page: "https://www.pexels.com/photo/brown-johdpuri-suit-2060241/",
    description: "Brown embroidered Jodhpuri suit, garment only",
    use: "listing",
  },
  {
    file: "ornate-sherwani-hanger.jpg",
    source: "pexels",
    id: "18016521",
    photographer: "viresh studio",
    page: "https://www.pexels.com/photo/traditional-clothing-on-hanger-18016521/",
    description: "Ornate sherwani on a hanger",
    use: "listing",
  },
  {
    file: "white-sherwani-dupatta.jpg",
    source: "pexels",
    id: "37439727",
    photographer: "the Amritdev",
    page: "https://www.pexels.com/photo/traditional-groom-s-sherwani-with-red-dupatta-37439727/",
    description: "White sherwani with a red dupatta",
    use: "listing",
  },
  {
    file: "sherwani-on-branch.jpg",
    source: "pexels",
    id: "21926986",
    photographer: "Fahad Puthawala",
    page: "https://www.pexels.com/photo/close-up-of-an-embroidered-sherwani-hanging-on-a-branch-21926986/",
    description: "Embroidered sherwani hung on a branch",
    use: "listing",
  },
  {
    file: "sherwani-outdoors.jpg",
    source: "pexels",
    id: "39210712",
    photographer: "Deepak Sharma",
    page: "https://www.pexels.com/photo/elegant-traditional-indian-sherwani-on-display-39210712/",
    description: "Embroidered sherwani displayed outdoors",
    use: "listing",
  },
  {
    file: "bridal-lehenga-display.jpg",
    source: "pexels",
    id: "37396069",
    photographer: "Gaurav Vishwakarma",
    page: "https://www.pexels.com/photo/exquisite-embroidered-indian-bridal-lehenga-37396069/",
    description: "Bridal lehenga on display outdoors, garment only",
    use: "listing",
  },
  {
    file: "lehenga-palm.jpg",
    source: "pexels",
    id: "36489477",
    photographer: "Gaurav Vishwakarma",
    page: "https://www.pexels.com/photo/elegant-indian-bridal-lehenga-hung-on-palm-tree-36489477/",
    description: "Bridal lehenga hung on a palm tree",
    use: "listing",
  },
  {
    file: "banarasi-saree.jpg",
    source: "pexels",
    id: "38890438",
    photographer: "Kizhakke Vdu",
    page: "https://www.pexels.com/photo/elegant-blue-banarasi-silk-saree-with-intricate-design-38890438/",
    description: "Blue Banarasi silk saree laid on a table",
    use: "listing",
  },
  {
    file: "white-sherwani-necklace.jpg",
    source: "unsplash",
    id: "bPBxu6-blrU",
    photographer: "ARTO SURAJ",
    page: "https://unsplash.com/photos/bPBxu6-blrU",
    description: "White sherwani with a green necklace",
    use: "listing",
  },
  {
    file: "lehenga-skirt-spread.jpg",
    source: "unsplash",
    id: "reZz3rNHBdQ",
    photographer: "Abhishek Sharma",
    page: "https://unsplash.com/photos/reZz3rNHBdQ",
    description: "Bridal lehenga skirt spread out, close-up",
    use: "listing",
  },
];

const ROOT = path.resolve(import.meta.dirname, "..");
const DIRS: Record<Use, string> = {
  editorial: path.join(ROOT, "public/images/editorial"),
  texture: path.join(ROOT, "public/images/textures"),
  listing: path.join(ROOT, "prisma/seed-assets"),
};
const LICENCES: Record<Source, { name: string; url: string }> = {
  pexels: { name: "Pexels License", url: "https://www.pexels.com/license/" },
  unsplash: { name: "Unsplash License", url: "https://unsplash.com/license" },
};
const MAX_WIDTH = { editorial: 2000, texture: 1800, listing: 1400 } satisfies Record<Use, number>;

function downloadUrl(photo: Photo): string {
  if (photo.source === "pexels") {
    return `https://images.pexels.com/photos/${photo.id}/pexels-photo-${photo.id}.jpeg?cs=srgb&fm=jpg&w=2400`;
  }
  return `https://unsplash.com/photos/${photo.id}/download?force=true`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchPhoto(photo: Photo, force: boolean): Promise<"skipped" | "downloaded"> {
  const target = path.join(DIRS[photo.use], photo.file);
  if (!force && (await exists(target))) return "skipped";

  const response = await fetch(downloadUrl(photo), {
    redirect: "follow",
    headers: { "User-Agent": "peti-image-fetch/1.0 (open-source project asset script)" },
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) {
    throw new Error(`${photo.file}: HTTP ${response.status} (${type}) from ${photo.source}`);
  }
  const input = Buffer.from(await response.arrayBuffer());
  // Re-encode: strips EXIF/GPS metadata, normalises orientation and keeps the repository small.
  const output = await sharp(input)
    .rotate()
    .resize({ width: MAX_WIDTH[photo.use], withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  await writeFile(target, output);
  return "downloaded";
}

function attribution(retrievedOn: string): string {
  const sections: Array<[Use, string]> = [
    ["editorial", "Editorial images (`public/images/editorial`) — never presented as lenders or renters"],
    ["texture", "Textile details (`public/images/textures`)"],
    ["listing", "Garment-only photos used by demo listings (`prisma/seed-assets`)"],
  ];
  const lines = [
    "# Photo attribution",
    "",
    "These photographs are **not** covered by the repository's MIT licence. Each remains under its source",
    "licence. Files are resized, re-encoded copies made by `scripts/fetch-images.ts` (metadata stripped).",
    "People shown in editorial images are models in stock photography; they are not Peti users and do not",
    "endorse Peti. Demo listings in seed data are fictional.",
    "",
    `Retrieved: ${retrievedOn}`,
    "",
  ];
  for (const [use, title] of sections) {
    lines.push(
      `## ${title}`,
      "",
      "| File | Description | Photographer | Source | Licence |",
      "|---|---|---|---|---|",
    );
    for (const p of photos.filter((x) => x.use === use)) {
      const licence = LICENCES[p.source];
      lines.push(
        `| \`${p.file}\` | ${p.description} | ${p.photographer} | [${p.source}](${p.page}) | [${licence.name}](${licence.url}) |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const force = process.argv.includes("--force");
  await Promise.all(Object.values(DIRS).map((dir) => mkdir(dir, { recursive: true })));

  const failures: string[] = [];
  for (const photo of photos) {
    try {
      const result = await fetchPhoto(photo, force);
      console.log(`${result.padEnd(10)} ${photo.use.padEnd(9)} ${photo.file}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const retrievedOn = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(ROOT, "public/images/ATTRIBUTION.md"), attribution(retrievedOn));

  if (failures.length > 0) {
    console.error(`\n${failures.length} download(s) failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
