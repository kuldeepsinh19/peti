/**
 * Regression tests for the findings of the independent security and money review
 * (docs/architecture/security-architecture.md, "Review findings"). Each test names what it protects.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import { dispatchPendingEmails } from "@/modules/notifications";
import { prismaNotificationOutbox } from "@/modules/notifications/infrastructure/notification-outbox";
import { actorFor, buildApp } from "../support/app";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { createOutfit, createUser, db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

async function paidBooking(startDate = "2026-12-10") {
  const app = buildBookingApp();
  const s = await scenario();
  const { bookingId } = await app.bookings.request(s.renter, {
    outfitId: s.outfit.id,
    startDate,
    days: 3,
    acceptTerms: "on",
  });
  await app.bookings.approve(s.owner, { bookingId });
  const paid = await app.payThroughSandbox(s.renter, bookingId);
  return { app, ...s, bookingId, orderId: paid.orderId };
}

describe("money the provider took that does not fit the booking", () => {
  it("flags a second capture for an administrator instead of applying it or retrying forever", async () => {
    const { app, bookingId, orderId } = await paidBooking();
    const first = await db.payment.findUniqueOrThrow({ where: { bookingId } });

    const second = await app.sandbox.simulate(orderId, "pay");
    const webhook = second.webhooks[0]!;
    expect(await app.payments.handleWebhook(webhook.body, webhook.headers)).toEqual({
      status: 200,
      body: "flagged",
    });
    // A provider retry of the same event is a duplicate, not another failure.
    expect(await app.payments.handleWebhook(webhook.body, webhook.headers)).toMatchObject({ status: 200 });
    expect((await app.payments.handleCallback(second.callback!)).outcome).toBe("INVALID");

    expect(await db.auditLog.count({ where: { action: "payment.unexpectedCapture" } })).toBe(2);
    const after = await db.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(after.providerPaymentId).toBe(first.providerPaymentId);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CONFIRMED");
  });
});

describe("refund outbox", () => {
  it("reclaims a refund left INITIATED by a crashed worker, but only after the lease", async () => {
    const { app, renter, bookingId } = await paidBooking();
    await app.bookings.cancel(renter, { bookingId });
    const refund = await db.refund.findFirstOrThrow({ where: { payment: { bookingId } } });
    const crashedAt = (minutesAgo: number) =>
      db.refund.update({
        where: { id: refund.id },
        data: {
          status: "INITIATED",
          providerRefundId: null,
          initiatedAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });

    await crashedAt(5);
    expect(await app.payments.dispatchRefunds()).toMatchObject({ claimed: 0 });

    await crashedAt(20);
    expect(await app.payments.dispatchRefunds()).toMatchObject({ claimed: 1, sent: 1 });
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
      status: "PROCESSED",
      providerRefundId: expect.any(String),
    });
  });
});

describe("handover that never happened", () => {
  it("escalates a paid booking to an administrator once its rental period has ended", async () => {
    const { app, owner, renter, bookingId } = await paidBooking("2026-12-10"); // 10–12 Dec
    app.clock.set("2026-12-12T06:30:00Z");
    expect((await app.bookings.sweep()).autoDisputed).toBe(0);
    app.clock.set("2026-12-13T06:30:00Z");
    expect((await app.bookings.sweep()).autoDisputed).toBe(1);

    expect(await db.dispute.findFirstOrThrow({ where: { bookingId } })).toMatchObject({
      kind: "HANDOVER_FAILED",
      openedByRole: "SYSTEM",
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("DISPUTED");
    // Neither party can settle a system dispute on their own: the deposit stays held for an admin.
    for (const actor of [renter, owner]) {
      await expect(app.bookings.acceptClaim(actor, { bookingId })).rejects.toMatchObject({
        code: "NEEDS_ADMIN",
      });
    }
    expect((await app.bookings.sweep()).autoDisputed).toBe(0);
  });
});

describe("claims opened by an administrator", () => {
  it("cannot be settled by the participant who benefits from them", async () => {
    const { app, owner, renter, admin, bookingId } = await paidBooking("2026-12-10");
    app.clock.set("2026-12-10T05:00:00Z");
    await app.bookings.submitHandoverReport(
      owner,
      { bookingId, grade: "EXCELLENT", notes: "Perfect." },
      photos(3),
    );
    await app.bookings.acknowledgeHandover(renter, { bookingId });
    app.clock.set("2026-12-12T12:00:00Z");
    await app.bookings.recordReturn(owner, { bookingId, grade: "GOOD", notes: "Torn hem." }, photos(3));
    await app.bookings.openDispute(admin, {
      bookingId,
      kind: "DAMAGE",
      description: "Reported by phone: the hem is torn.",
      claimedRupees: "5000",
    });
    for (const actor of [owner, renter]) {
      await expect(app.bookings.acceptClaim(actor, { bookingId })).rejects.toMatchObject({
        code: "NEEDS_ADMIN",
      });
    }
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("DISPUTED");
  });
});

describe("suspended owners", () => {
  it("hides their listings from search and the detail page and refuses new requests", async () => {
    const { app, owner, renter, admin, outfit } = await paidBookingFreeScenario();
    const { search } = buildApp();
    const ids = async () => (await search.explore({}).result).items.map((i) => i.id);
    expect(await ids()).toContain(outfit.id);

    await db.user.update({ where: { id: owner.userId }, data: { banned: true } });

    expect(await ids()).not.toContain(outfit.id);
    await expect(search.outfit(null, outfit.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(search.outfit(renter, outfit.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(search.outfit(admin, outfit.slug)).resolves.toMatchObject({ id: outfit.id });
    await expect(
      app.bookings.request(renter, {
        outfitId: outfit.id,
        startDate: "2026-12-10",
        days: 3,
        acceptTerms: "on",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  async function paidBookingFreeScenario() {
    return { app: buildBookingApp(), ...(await scenario()) };
  }
});

describe("listing status writes", () => {
  it("only change a listing that is still in the status the caller saw", async () => {
    const outfit = await createOutfit({ status: "PENDING_REVIEW" });
    const repo = prismaListingRepository(db);
    expect(await repo.setStatus(outfit.id, "ACTIVE", "PAUSED")).toBe(false);
    expect((await db.outfit.findUniqueOrThrow({ where: { id: outfit.id } })).status).toBe("PENDING_REVIEW");
    expect(await repo.setStatus(outfit.id, "PENDING_REVIEW", "ACTIVE")).toBe(true);
  });

  it("two administrators deciding one listing at once: exactly one decision lands", async () => {
    const { listings } = buildApp();
    const admin = actorFor(await createUser({ name: "Admin", role: "admin" }));
    const outfit = await createOutfit({ status: "PENDING_REVIEW", photos: 1 });
    const results = await Promise.allSettled([
      listings.approve(admin, { outfitId: outfit.id }),
      listings.reject(admin, { outfitId: outfit.id, note: "Photos are of a different garment." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const status = (await db.outfit.findUniqueOrThrow({ where: { id: outfit.id } })).status;
    expect(status).toBe(results[0].status === "fulfilled" ? "ACTIVE" : "REJECTED");
  });
});

describe("notification email outbox", () => {
  async function pendingEmails(n: number) {
    const user = await createUser();
    await db.notification.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        userId: user.id,
        channel: "EMAIL" as const,
        type: "test",
        subject: `Message ${i}`,
        body: "Body",
        dedupeKey: `test:${user.id}:${i}`,
      })),
    });
  }

  it("two dispatchers running at once send each email exactly once", async () => {
    await pendingEmails(6);
    const sent: string[] = [];
    const mail = {
      async send(m: { subject: string }) {
        await new Promise((r) => setTimeout(r, 20));
        sent.push(m.subject);
      },
    };
    const outbox = prismaNotificationOutbox(db);
    await Promise.all([
      dispatchPendingEmails(outbox, mail as never, "http://localhost"),
      dispatchPendingEmails(outbox, mail as never, "http://localhost"),
    ]);
    expect(sent).toHaveLength(6);
    expect(new Set(sent).size).toBe(6);
    expect(await db.notification.count({ where: { status: "SENT" } })).toBe(6);
  });

  it("records each failure and gives up after five attempts", async () => {
    await pendingEmails(1);
    const failing = {
      send: async () => {
        throw new Error("SMTP 451 try again later");
      },
    };
    const outbox = prismaNotificationOutbox(db);
    for (let i = 0; i < 6; i++) await dispatchPendingEmails(outbox, failing, "http://localhost");
    expect(await db.notification.findFirstOrThrow()).toMatchObject({
      status: "FAILED",
      attempts: 5,
      lastError: "SMTP 451 try again later",
    });
  });
});
