import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/shared/infrastructure/prisma";

/** Shared Prisma client for the integration suite (one per test file). */
export const db: PrismaClient = createPrismaClient(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$disconnect();
});

/** A raw pg client, for tests that need explicit transaction control across two connections. */
export async function rawClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// Tables are truncated between tests. Concurrency tests need real commits, so tests must never be wrapped
// in a rollback-per-test transaction. Reference data (booking_allowed_transitions) is left alone.
const TABLES = [
  "audit_logs",
  "notifications",
  "dispute_messages",
  "disputes",
  "reviews",
  "condition_report_photos",
  "condition_reports",
  "payouts",
  "security_deposits",
  "refunds",
  "payments",
  "provider_events",
  "booking_status_history",
  "calendar_holds",
  "bookings",
  "saved_outfits",
  "outfit_price_options",
  "outfit_measurements",
  "outfit_images",
  "outfits",
  "outfit_categories",
  "addresses",
  "owner_payout_accounts",
  "user_profiles",
  "sessions",
  "accounts",
  "verifications",
  "auth_rate_limits",
  "app_rate_limits",
  "dev_outbox_messages",
  "sandbox_provider_objects",
  "users",
  "localities",
];

export async function resetDatabase(): Promise<void> {
  // History and audit tables are append-only via row triggers; TRUNCATE does not fire row triggers.
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(
  overrides: { name?: string; role?: "user" | "admin"; verified?: boolean } = {},
) {
  const id = unique();
  const verified = overrides.verified ?? true;
  const phoneDigits = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999)).slice(0, 10);
  const user = await db.user.create({
    data: {
      name: overrides.name ?? `Test User ${id}`,
      email: `user-${id}@example.test`,
      emailVerified: verified,
      role: overrides.role ?? "user",
      phoneNumber: `+91${phoneDigits}`,
      phoneNumberVerified: verified,
      profile: { create: { displayName: overrides.name ?? `Tester ${id}`.slice(0, 60) } },
    },
  });
  return user;
}

export async function createLocality() {
  const id = unique();
  return db.locality.create({ data: { city: "Ahmedabad", name: `Locality ${id}`, slug: `locality-${id}` } });
}

export async function createCategory() {
  const id = unique();
  return db.outfitCategory.create({
    data: { slug: `category-${id}`, name: `Category ${id}`, audience: "MEN" },
  });
}

export interface OutfitFixture {
  ownerId?: string;
  status?: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "PAUSED" | "SUSPENDED";
  depositPaise?: number;
  turnaroundDays?: number;
  prices?: Array<{ durationDays: number; pricePaise: number }>;
  /** Number of photograph rows to attach (none by default). */
  photos?: number;
}

export async function createOutfit(fixture: OutfitFixture = {}) {
  const owner = fixture.ownerId ? { id: fixture.ownerId } : await createUser();
  const [locality, category] = await Promise.all([createLocality(), createCategory()]);
  const prices = fixture.prices ?? [
    { durationDays: 3, pricePaise: 450_000 },
    { durationDays: 5, pricePaise: 650_000 },
  ];
  const id = unique();
  return db.outfit.create({
    data: {
      ownerId: owner.id,
      categoryId: category.id,
      slug: `outfit-${id}`,
      title: `Test sherwani ${id}`,
      description: "An ivory sherwani with thread-work, worn once.",
      sizeLabel: "M",
      conditionGrade: "EXCELLENT",
      conditionNotes: "No known flaws.",
      retailValuePaise: 3_000_000,
      depositPaise: fixture.depositPaise ?? 500_000,
      minPricePaise: Math.min(...prices.map((p) => p.pricePaise)),
      turnaroundDays: fixture.turnaroundDays ?? 1,
      occasions: ["WEDDING"],
      localityId: locality.id,
      status: fixture.status ?? "ACTIVE",
      publishedAt: new Date(),
      priceOptions: { create: prices },
      images: {
        create: Array.from({ length: fixture.photos ?? 0 }, (_, i) => ({
          storageKey: `outfits/outfit-${id}/${i}.jpg`,
          altText: "Front view",
          width: 900,
          height: 1200,
          sortOrder: i,
        })),
      },
    },
    include: { priceOptions: true, images: true },
  });
}

/** Inserts a booking row directly (bypassing use cases) for database-guard tests. */
export async function insertBookingRow(input: {
  outfitId: string;
  ownerId: string;
  renterId: string;
  startDate?: string;
  endDate?: string;
}) {
  const start = input.startDate ?? "2027-01-10";
  const end = input.endDate ?? "2027-01-12";
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return db.booking.create({
    data: {
      reference: `PT-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      outfitId: input.outfitId,
      ownerId: input.ownerId,
      renterId: input.renterId,
      startDate: new Date(`${start}T00:00:00Z`),
      endDate: new Date(`${end}T00:00:00Z`),
      rentalDays: days,
      bufferDays: 1,
      rentalFeePaise: 450_000,
      depositPaise: 500_000,
      commissionRateBps: 1500,
      commissionPaise: 67_500,
      renterTotalPaise: 950_000,
      ownerPayoutPaise: 382_500,
      lateFeePerDayPaise: 225_000,
      termsVersion: "test",
      policySnapshot: {},
      renterAcceptedAt: new Date(),
    },
  });
}
