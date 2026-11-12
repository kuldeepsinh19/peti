import { bookingsUseCases } from "@/modules/bookings";
import { prismaBookingQueries } from "@/modules/bookings/infrastructure/booking-queries";
import { prismaBookingStore } from "@/modules/bookings/infrastructure/prisma-booking-store";
import { prismaNotificationWriter } from "@/modules/notifications/infrastructure/notification-writer";
import { paymentsUseCases, type PaymentsUseCases } from "@/modules/payments";
import { prismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";
import { sandboxProvider, type SandboxOutcome } from "@/modules/payments/infrastructure/sandbox-provider";
import type { RateLimiter } from "@/shared/application/rate-limiter";
import type { UserActor } from "@/shared/application/actor";
import { fixedClock } from "@/shared/domain/clock";
import { prismaUnitOfWork } from "@/shared/infrastructure/unit-of-work";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { actorFor } from "./app";
import { createOutfit, createUser, db } from "./db";

export const SANDBOX_SECRETS = { keySecret: "test-key-secret", webhookSecret: "test-webhook-secret" };

const noLimits: RateLimiter = { consume: async () => {} };

/** Bookings + payments wired exactly as in production, against the test database and sandbox provider. */
export function buildBookingApp(start = "2026-12-01T06:30:00Z") {
  const clock = fixedClock(start); // 12:00 IST on 1 Dec 2026
  const sandbox = sandboxProvider(db, SANDBOX_SECRETS);
  let payments: PaymentsUseCases | null = null;
  const reportKeys: string[] = [];
  const bookings = bookingsUseCases({
    uow: prismaUnitOfWork(db, (tx) => prismaBookingStore(tx, prismaNotificationWriter(tx))),
    clock,
    rateLimiter: noLimits,
    reportPhotos: {
      async save(bookingId) {
        const key = `reports/${bookingId}/${reportKeys.length}.jpg`;
        reportKeys.push(key);
        return key;
      },
    },
    queries: prismaBookingQueries(db),
    paymentReconciler: { reconcile: (id) => payments?.reconcile(id) ?? Promise.resolve() },
  });
  payments = paymentsUseCases({
    provider: sandbox.provider,
    payments: prismaPaymentRepository(db),
    bookings,
    clock,
    appUrl: "http://localhost:3100",
    audit: prismaAuditLog(db),
  });
  const pay = payments;

  /** Plays the sandbox checkout outcome and delivers its signed callback/webhooks through the real handlers. */
  async function payThroughSandbox(renter: UserActor, bookingId: string, outcome: SandboxOutcome = "pay") {
    const session = await pay.startCheckout(renter, bookingId);
    if (session.mode !== "REDIRECT") throw new Error("expected sandbox redirect");
    const orderId = session.url.split("/").pop()!;
    const sim = await sandbox.simulate(orderId, outcome);
    const results = [];
    for (const w of sim.webhooks) results.push(await pay.handleWebhook(w.body, w.headers));
    const callback = sim.callback ? await pay.handleCallback(sim.callback) : null;
    return { orderId, sim, webhookResults: results, callback };
  }

  return { clock, sandbox, bookings, payments: pay, payThroughSandbox, reportKeys };
}

export const photos = (n: number) => Array.from({ length: n }, () => new Uint8Array([1, 2, 3]));

/** An active outfit with a verified owner and renter. */
export async function scenario(
  opts: { prices?: Array<{ durationDays: number; pricePaise: number }>; depositPaise?: number } = {},
) {
  const [ownerUser, renterUser, adminUser] = await Promise.all([
    createUser({ name: "Owner" }),
    createUser({ name: "Renter" }),
    createUser({ name: "Admin", role: "admin" }),
  ]);
  const outfit = await createOutfit({
    ownerId: ownerUser.id,
    depositPaise: opts.depositPaise ?? 800_000,
    prices: opts.prices ?? [{ durationDays: 3, pricePaise: 450_000 }],
  });
  return {
    outfit,
    owner: actorFor(ownerUser),
    renter: actorFor(renterUser),
    admin: actorFor(adminUser),
  };
}

export async function reconciliation(bookingId: string) {
  const rows = await db.$queryRaw<Array<{ imbalance_paise: number; captured_paise: number }>>`
    SELECT imbalance_paise, captured_paise FROM v_booking_money_reconciliation WHERE booking_id = ${bookingId}::uuid`;
  return rows[0] ?? null;
}

/** ADR-004 invariant: a booking has a hold iff its status is a holding status. Must return no rows. */
export async function holdInvariantViolations() {
  return db.$queryRaw<Array<{ id: string }>>`
    SELECT b.id FROM bookings b LEFT JOIN calendar_holds h ON h.booking_id = b.id
    WHERE (b.status IN ('AWAITING_PAYMENT','CONFIRMED','ACTIVE','RETURNED','DISPUTED','COMPLETED')) <> (h.id IS NOT NULL)`;
}
