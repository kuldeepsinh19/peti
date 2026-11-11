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

async function seedUsers(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const hash = await hashPassword(demoPassword);
  for (const u of users) {
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

async function storePhoto(file: string, outfitSlug: string, index: number) {
  const source = await readFile(path.join(import.meta.dirname, "seed-assets", file));
  const { data, info } = await sharp(source)
    .rotate()
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
    if (await db.outfit.findUnique({ where: { slug } })) continue;
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
    for (const [i, p] of o.photos.entries())
      photos.push({ ...(await storePhoto(p.file, slug, i)), alt: p.alt });
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
    `Seeded ${localities.length} localities, ${categories.length} categories, ${users.length} demo accounts,`,
  );
  console.log(`${createdOutfits} new demo listings.`);
  console.log(`\nDemo accounts (fictional), all with password "${demoPassword}":`);
  for (const u of users) console.log(`  ${u.role.padEnd(5)}  ${u.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
