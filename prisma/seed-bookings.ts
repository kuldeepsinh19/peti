/**
 * Ready-made bookings for demonstrating the rental journey on the LOCAL POC (docs/development/poc-demo-guide.md).
 *
 *   pnpm db:seed:bookings      (after pnpm db:seed)
 *
 * A real rental moves over several days (handover on the start day, return on the end day, a 48-hour
 * inspection window). Instead of a fake clock in the app, this script creates bookings dated relative to
 * today, so each step can be shown now. Every booking is made through the real use cases (request, approval,
 * a SIMULATED sandbox payment delivered as signed webhooks, condition reports), with this script's clock set
 * to the moment each step would have happened. Nothing is written directly to booking tables.
 *
 * Run it again on the same day and it does nothing for bookings still at their stage; one a demo has moved on
 * is replaced by a fresh one, and a later day gets its own set (earlier ones stay: booking history is
 * append-only). It refuses to run anywhere but local and test.
 */
import "dotenv/config";
import { parseEnv } from "../src/config/env";
import { marketplacePolicy } from "../src/config/marketplace-policy";
import { bookingsUseCases, DatesUnavailableError } from "../src/modules/bookings";
import { prismaBookingQueries } from "../src/modules/bookings/infrastructure/booking-queries";
import { prismaBookingStore } from "../src/modules/bookings/infrastructure/prisma-booking-store";
import { storageReportPhotoStore } from "../src/modules/bookings/infrastructure/report-photo-store";
import { sharpImageProcessor } from "../src/modules/media/infrastructure/image-processor";
import { filesystemStorage } from "../src/modules/media/infrastructure/storage";
import { prismaNotificationWriter } from "../src/modules/notifications/infrastructure/notification-writer";
import { paymentsUseCases, type PaymentsUseCases } from "../src/modules/payments";
import { prismaPaymentRepository } from "../src/modules/payments/infrastructure/prisma-payment-repository";
import { sandboxProvider } from "../src/modules/payments/infrastructure/sandbox-provider";
import type { UserActor } from "../src/shared/application/actor";
import { fixedClock, HOUR_MS } from "../src/shared/domain/clock";
import { addDays, type LocalDate, localDateInIndia } from "../src/shared/domain/local-date";
import { prismaAuditLog } from "../src/shared/infrastructure/audit";
import { getPrisma } from "../src/shared/infrastructure/prisma";
import { prismaUnitOfWork } from "../src/shared/infrastructure/unit-of-work";

const env = parseEnv(process.env);
if (env.APP_ENV !== "local" && env.APP_ENV !== "test") {
  console.error(
    `Refusing to seed demo bookings: APP_ENV is "${env.APP_ENV}". This is for the local POC only.`,
  );
  process.exit(1);
}
if (env.PAYMENT_PROVIDER !== "sandbox" || env.STORAGE_DRIVER !== "filesystem") {
  console.error(
    "Demo bookings need PAYMENT_PROVIDER=sandbox and STORAGE_DRIVER=filesystem (see .env.example).",
  );
  process.exit(1);
}

const db = getPrisma();
const today = localDateInIndia(new Date());
/** An instant on a local (India) date: at("2026-12-10", 10) is 10:00 IST that day. */
const at = (date: LocalDate, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);

const clock = fixedClock(new Date());
const storage = filesystemStorage(env.STORAGE_FS_ROOT);
const sandbox = sandboxProvider(db, {
  keySecret: env.SANDBOX_PAYMENT_KEY_SECRET!,
  webhookSecret: env.SANDBOX_PAYMENT_WEBHOOK_SECRET!,
});
let payments: PaymentsUseCases | null = null;
const bookings = bookingsUseCases({
  uow: prismaUnitOfWork(db, (tx) => prismaBookingStore(tx, prismaNotificationWriter(tx))),
  clock,
  rateLimiter: { consume: async () => {} },
  reportPhotos: storageReportPhotoStore(storage, sharpImageProcessor(marketplacePolicy.maxUploadBytes)),
  queries: prismaBookingQueries(db),
  paymentReconciler: { reconcile: (id) => payments?.reconcile(id) ?? Promise.resolve() },
});
payments = paymentsUseCases({
  provider: sandbox.provider,
  payments: prismaPaymentRepository(db),
  bookings,
  clock,
  appUrl: env.APP_URL,
  audit: prismaAuditLog(db),
});
const pay = payments;

async function actor(email: string): Promise<UserActor> {
  const u = await db.user.findUnique({ where: { email }, include: { profile: true } });
  if (!u) throw new Error(`${email} is missing: run pnpm db:seed first.`);
  return {
    kind: "user",
    userId: u.id,
    displayName: u.profile?.displayName ?? u.name,
    email: u.email,
    isAdmin: u.role === "admin",
    emailVerified: u.emailVerified,
    phoneVerified: Boolean(u.phoneNumberVerified),
  };
}

/** The listing's own photographs, used as the condition-report photographs. */
async function reportPhotos(outfitId: string): Promise<Uint8Array[]> {
  const images = await db.outfitImage.findMany({ where: { outfitId }, orderBy: { sortOrder: "asc" } });
  const bytes: Uint8Array[] = [];
  for (const image of images) {
    const object = await storage.get(image.storageKey);
    if (object) bytes.push(object.body);
  }
  if (bytes.length === 0) throw new Error("A seeded listing has no stored photographs: run pnpm db:seed.");
  while (bytes.length < marketplacePolicy.minConditionPhotos) bytes.push(bytes[0]!);
  return bytes.slice(0, Math.max(marketplacePolicy.minConditionPhotos, 3));
}

type Stage = "AWAITING_PAYMENT" | "CONFIRMED" | "ACTIVE" | "RETURNED" | "COMPLETED";
interface Scenario {
  name: string;
  stage: Stage;
  start: LocalDate;
  /** What the demo shows with it. */
  shows: string;
}

const scenarios: Scenario[] = [
  {
    name: "starts-today",
    stage: "CONFIRMED",
    start: today,
    shows: "paid, starts today: the owner records the handover, the renter confirms it",
  },
  {
    name: "ends-today",
    stage: "ACTIVE",
    start: addDays(today, -2),
    shows: "handed over, due back today: the owner records the return",
  },
  {
    name: "returned",
    stage: "RETURNED",
    start: addDays(today, -3),
    shows: "returned yesterday: the owner confirms it, or claims for damage",
  },
  {
    name: "awaiting-payment",
    stage: "AWAITING_PAYMENT",
    start: addDays(today, 6),
    shows: "approved, not paid: decline a payment, then pay, then cancel for a refund",
  },
  {
    name: "completed",
    stage: "COMPLETED",
    start: addDays(today, -9),
    shows: "completed: both sides can leave a review",
  },
];

const RENTER = "rohan@peti.local";
const DAYS = 3;

type Created = {
  scenario: string;
  stage: Stage;
  bookingId: string;
  reference: string;
  /** Its status now (an earlier demo today may have moved it on). */
  status: string;
  outfit: string;
  owner: string;
  createdNow: boolean;
};

const BOOKING_SUMMARY = {
  id: true,
  reference: true,
  status: true,
  outfit: { select: { title: true, owner: { select: { email: true } } } },
} as const;

async function create(s: Scenario, renter: UserActor): Promise<Created> {
  const note = `Ready-made demo booking for the local POC (${s.name}, seeded ${today}).`;
  // Already seeded today and still at its stage. One that a demo today has moved on (handed over, paid,
  // cancelled...) no longer shows that stage, so a fresh one is made: the demo can be rehearsed again.
  const existing = await db.booking.findFirst({
    where: { renterNote: note, status: s.stage },
    select: BOOKING_SUMMARY,
  });
  const summary = (
    b: { id: string; reference: string; status: string; outfit: { title: string; owner: { email: string } } },
    createdNow: boolean,
  ): Created => ({
    scenario: s.name,
    stage: s.stage,
    bookingId: b.id,
    reference: b.reference,
    status: b.status,
    outfit: b.outfit.title,
    owner: b.outfit.owner.email,
    createdNow,
  });
  if (existing) return summary(existing, false);

  const candidates = await db.outfit.findMany({
    where: {
      status: "ACTIVE",
      ownerId: { not: renter.userId },
      priceOptions: { some: { durationDays: DAYS } },
    },
    select: { id: true, title: true, owner: { select: { email: true } } },
    orderBy: { publishedAt: "asc" },
  });

  // Requested a week before the start, so the lead time and the approval and payment windows all apply. The
  // one still to be paid is requested and approved just now, so its payment window is open.
  const week = addDays(s.start, -7);
  const now = new Date();
  const requestedAt = s.stage === "AWAITING_PAYMENT" ? new Date(now.getTime() - 2 * HOUR_MS) : at(week, 10);
  const approvedAt = s.stage === "AWAITING_PAYMENT" ? new Date(now.getTime() - HOUR_MS) : at(week, 12);
  for (const outfit of candidates) {
    clock.set(requestedAt);
    let bookingId: string;
    try {
      ({ bookingId } = await bookings.request(renter, {
        outfitId: outfit.id,
        startDate: s.start,
        days: DAYS,
        note,
        acceptTerms: "on",
      }));
    } catch (error) {
      if (error instanceof DatesUnavailableError) continue; // taken on those dates; try the next listing
      throw error;
    }
    const owner = await actor(outfit.owner.email);
    clock.set(approvedAt);
    await bookings.approve(owner, { bookingId });

    if (s.stage !== "AWAITING_PAYMENT") {
      // A SIMULATED payment: the sandbox provider's signed webhooks, through the real handlers.
      clock.set(at(week, 13));
      const session = await pay.startCheckout(renter, bookingId);
      if (session.mode !== "REDIRECT") throw new Error("Expected the sandbox checkout.");
      const sim = await sandbox.simulate(session.url.split("/").pop()!, "pay");
      for (const w of sim.webhooks) await pay.handleWebhook(w.body, w.headers);
    }

    const end = addDays(s.start, DAYS - 1);
    if (s.stage === "ACTIVE" || s.stage === "RETURNED" || s.stage === "COMPLETED") {
      const photos = await reportPhotos(outfit.id);
      clock.set(at(s.start, 10));
      await bookings.submitHandoverReport(
        owner,
        { bookingId, grade: "EXCELLENT", notes: "Seeded handover: clean, pressed, all pieces present." },
        photos,
      );
      clock.set(at(s.start, 10, 30));
      await bookings.acknowledgeHandover(renter, { bookingId });
      if (s.stage !== "ACTIVE") {
        clock.set(at(end, 18));
        await bookings.recordReturn(
          owner,
          { bookingId, grade: "EXCELLENT", notes: "Seeded return: back on time, as it left." },
          photos,
        );
      }
      if (s.stage === "COMPLETED") {
        clock.set(at(addDays(end, 1), 11));
        await bookings.confirmReturn(owner, { bookingId });
      }
    }

    return summary(
      await db.booking.findUniqueOrThrow({ where: { id: bookingId }, select: BOOKING_SUMMARY }),
      true,
    );
  }
  throw new Error(`No listing is free from ${s.start} for the "${s.name}" booking.`);
}

async function main() {
  const json = process.argv.includes("--json");
  const renter = await actor(RENTER);
  // Expire anything whose deadline has passed (as the background sweep would), so stale demo bookings from
  // an earlier run do not hold dates or count as seeded.
  clock.set(new Date());
  await bookings.sweep();
  const created: Created[] = [];
  for (const s of scenarios) created.push(await create(s, renter));
  if (json) {
    // For the end-to-end tests: { renter, bookings: [...] }.
    console.log(JSON.stringify({ renter: RENTER, bookings: created }));
    return;
  }
  console.log(`Ready-made demo bookings for ${today}. Renter: ${RENTER}. Payments are SIMULATED (sandbox).`);
  for (const [i, r] of created.entries()) {
    const now = r.createdNow ? "" : " [already seeded today]";
    console.log(
      `  ${r.reference.padEnd(10)} ${r.stage.padEnd(16)} ${scenarios[i]!.shows} (${r.outfit}; owner ${r.owner})${now}`,
    );
  }
  console.log("Sign in as the renter or the owner and open My rentals or Rental requests.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
