/**
 * Seeds demonstration data: localities, categories, fictional demo accounts and listings.
 *   pnpm db:seed
 *
 * Idempotent: re-running updates reference data and skips accounts/listings that already exist.
 * Refuses to run when APP_ENV=production. Demo accounts share one password (printed at the end).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseEnv } from "../src/config/env";
import { marketplacePolicy } from "../src/config/marketplace-policy";
import { filesystemStorage, s3Storage } from "../src/modules/media/infrastructure/storage";
import { categories, demoPassword, localities, outfits, users } from "./seed-data";

const env = parseEnv(process.env);
if (env.APP_ENV === "production") {
  console.error("Refusing to seed demonstration data into a production environment.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const storage =
  env.STORAGE_DRIVER === "s3"
    ? s3Storage({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      })
    : filesystemStorage(env.STORAGE_FS_ROOT);

const CITY = "Ahmedabad";
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function seedReferenceData() {
  for (const l of localities) {
    await db.locality.upsert({
      where: { slug: l.slug },
      create: { city: CITY, name: l.name, slug: l.slug },
      update: { name: l.name },
    });
  }
  for (const [i, c] of categories.entries()) {
    await db.outfitCategory.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: { name: c.name, description: c.description, audience: c.audience, sortOrder: i },
    });
  }
}

// `--without-admin` (used for the public demo): no administrator account, because the demo accounts share a
// published password, so an administrator account there would let any visitor moderate listings and money.
const withoutAdmin = process.argv.includes("--without-admin");
const seededUsers = users.filter((u) => !(withoutAdmin && u.role === "admin"));

async function seedUsers(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const hash = await hashPassword(demoPassword);
  for (const u of seededUsers) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      ids.set(u.key, existing.id);
      continue;
    }
    // Same shape Better Auth writes for email/password sign-up: a user row and a "credential" account.
    const created = await db.user.create({
      data: {
        name: u.name,
        email: u.email,
        emailVerified: true,
        role: u.role,
        phoneNumber: u.phone,
        phoneNumberVerified: true,
        profile: { create: { displayName: u.name } },
      },
    });
    await db.account.create({
      data: { userId: created.id, accountId: created.id, providerId: "credential", password: hash },
    });
    ids.set(u.key, created.id);
  }
  return ids;
}

/**
 * A seeded photograph: a whole asset, or a crop of one. Listings need at least
 * `marketplacePolicy.minListingPhotos` photographs, and there is one licensed asset per garment, so the extra
 * photographs are crops of the garment's own picture (the upper part, and a close-up of the centre). Their alt
 * text says so; nothing is invented.
 */
type SeedPhoto = { file: string; alt: string; crop?: "upper" | "centre" };

function seedPhotosFor(o: (typeof outfits)[number]): SeedPhoto[] {
  const list: SeedPhoto[] = [...o.photos];
  const first = o.photos[0]!;
  const crops: SeedPhoto[] = [
    { file: first.file, alt: `Closer view of the upper part: ${first.alt}`, crop: "upper" },
    { file: first.file, alt: `Close-up of the work: ${first.alt}`, crop: "centre" },
  ];
  for (const c of crops) if (list.length < marketplacePolicy.minListingPhotos) list.push(c);
  return list;
}

async function storePhoto(photo: SeedPhoto, outfitSlug: string, index: number) {
  const source = await readFile(path.join(import.meta.dirname, "seed-assets", photo.file));
  const upright = await sharp(source).rotate().toBuffer();
  let image = sharp(upright);
  if (photo.crop) {
    const meta = await sharp(upright).metadata();
    const w = meta.width!;
    const h = meta.height!;
    const region =
      photo.crop === "upper"
        ? { left: Math.round(w * 0.1), top: 0, width: Math.round(w * 0.8), height: Math.round(h * 0.55) }
        : {
            left: Math.round(w * 0.25),
            top: Math.round(h * 0.3),
            width: Math.round(w * 0.5),
            height: Math.round(h * 0.4),
          };
    image = image.extract(region);
  }
  const { data, info } = await image
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const key = `outfits/${outfitSlug}/${index}.jpg`;
  await storage.put(key, new Uint8Array(data), "image/jpeg");
  return { key, width: info.width, height: info.height };
}

async function seedOutfits(userIds: Map<string, string>) {
  const localityBySlug = new Map((await db.locality.findMany()).map((l) => [l.name, l.id]));
  const categoryBySlug = new Map((await db.outfitCategory.findMany()).map((c) => [c.slug, c.id]));
  let created = 0;

  for (const o of outfits) {
    const slug = slugify(`${o.title}-${o.owner}`);
    const existing = await db.outfit.findUnique({
      where: { slug },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (existing) {
      // Listings seeded before the photograph minimum get the missing crops; nothing else is touched.
      const wanted = seedPhotosFor(o);
      for (let i = existing._count.images; i < wanted.length; i++) {
        const stored = await storePhoto(wanted[i]!, slug, i);
        await db.outfitImage.create({
          data: {
            outfitId: existing.id,
            storageKey: stored.key,
            altText: wanted[i]!.alt,
            width: stored.width,
            height: stored.height,
            sortOrder: i,
          },
        });
      }
      continue;
    }
    const ownerId = userIds.get(o.owner)!;
    const localityId = localityBySlug.get(o.locality)!;

    let address = await db.address.findFirst({ where: { userId: ownerId, deletedAt: null } });
    address ??= await db.address.create({
      data: {
        userId: ownerId,
        label: "Home",
        line1: "Demo address — not a real location",
        localityId,
        pincode: "380015",
        isDefault: true,
      },
    });

    const photos = [];
    for (const [i, p] of seedPhotosFor(o).entries())
      photos.push({ ...(await storePhoto(p, slug, i)), alt: p.alt });
    const m = o.measurementsCm;
    const mm = (cm?: number) => (cm === undefined ? null : cm * 10);
    const status = o.status ?? "ACTIVE";
    const now = new Date();

    await db.outfit.create({
      data: {
        ownerId,
        categoryId: categoryBySlug.get(o.category)!,
        slug,
        title: o.title,
        description: o.description,
        brand: o.brand ?? null,
        colour: o.colour,
        fabric: o.fabric,
        sizeLabel: o.size,
        conditionGrade: o.condition,
        conditionNotes: o.conditionNotes,
        retailValuePaise: o.retailRupees * 100,
        depositPaise: o.depositRupees * 100,
        minPricePaise: Math.min(...o.prices.map(([, rupees]) => rupees)) * 100,
        turnaroundDays: 1,
        occasions: o.occasions,
        localityId,
        pickupAddressId: address.id,
        status,
        submittedAt: now,
        publishedAt: status === "ACTIVE" ? now : null,
        images: {
          create: photos.map((p, i) => ({
            storageKey: p.key,
            altText: p.alt,
            width: p.width,
            height: p.height,
            sortOrder: i,
          })),
        },
        measurements: {
          create: {
            chestMm: mm(m.chest),
            waistMm: mm(m.waist),
            hipMm: mm(m.hip),
            shoulderMm: mm(m.shoulder),
            sleeveMm: mm(m.sleeve),
            lengthMm: mm(m.length),
            bottomWaistMm: mm(m.bottomWaist),
            bottomLengthMm: mm(m.bottomLength),
          },
        },
        priceOptions: {
          create: o.prices.map(([durationDays, rupees]) => ({ durationDays, pricePaise: rupees * 100 })),
        },
      },
    });
    created++;
  }
  return created;
}

async function main() {
  await seedReferenceData();
  const userIds = await seedUsers();
  const createdOutfits = await seedOutfits(userIds);
  console.log(
    `Seeded ${localities.length} localities, ${categories.length} categories, ${seededUsers.length} demo accounts,`,
  );
  console.log(`${createdOutfits} new demo listings.`);
  if (withoutAdmin) console.log("No administrator account (--without-admin).");
  console.log(`\nDemo accounts (fictional), all with password "${demoPassword}":`);
  for (const u of seededUsers) console.log(`  ${u.role.padEnd(5)}  ${u.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
