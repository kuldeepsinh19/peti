/**
 * The money health summary behind /admin/money and GET /api/ops/money-health, and the per-booking money
 * timeline (ADR-006).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { moneyUseCases } from "@/modules/admin";
import { prismaMoneyQueries } from "@/modules/admin/infrastructure/prisma-money-queries";
import { buildBookingApp, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

const money = moneyUseCases(prismaMoneyQueries(db));

async function paidBooking() {
  const app = buildBookingApp();
  const s = await scenario();
  const { bookingId } = await app.bookings.request(s.renter, {
    outfitId: s.outfit.id,
    startDate: "2026-12-10",
    days: 3,
    acceptTerms: "on",
  });
  await app.bookings.approve(s.owner, { bookingId });
  const paid = await app.payThroughSandbox(s.renter, bookingId);
  const payment = await db.payment.findUniqueOrThrow({ where: { bookingId } });
  return { ...s, app, bookingId, orderId: paid.orderId, payment };
}

describe("money health", () => {
  it("is clean when nothing needs attention, and exposes counts only to the monitor", async () => {
    await paidBooking();
    const health = await money.monitor();
    expect(health).toMatchObject({ ok: true, attention: [] });
    expect(Object.values(health.counts).every((n) => n === 0)).toBe(true);
    expect(Object.keys(health).sort()).toEqual(["attention", "counts", "ok"]);
  });

  it("is for administrators only", async () => {
    const { renter, owner, bookingId } = await paidBooking();
    await expect(money.health(renter)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(money.timeline(owner, bookingId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("flags a stray capture until its refund has gone back", async () => {
    const { app, admin, orderId, bookingId } = await paidBooking();
    const stray = await app.sandbox.simulate(orderId, "pay-captured");
    await app.payments.handleWebhook(stray.webhooks[0]!.body, stray.webhooks[0]!.headers);

    const before = await money.health(admin);
    expect(before.ok).toBe(false);
    expect(before.attention).toEqual(["unexpectedCapturesOutstanding"]);
    expect(before.lists.unexpectedCaptures).toMatchObject([{ bookingId, status: "PENDING" }]);

    await app.payments.dispatchRefunds();
    expect(await money.monitor()).toMatchObject({ ok: true });
  });

  it("flags failed refunds, failed payouts, waiting authorisations and failed webhooks", async () => {
    const { app, orderId, bookingId, payment, owner } = await paidBooking();
    const stray = await app.sandbox.simulate(orderId, "pay-captured");
    await app.payments.handleWebhook(stray.webhooks[0]!.body, stray.webhooks[0]!.headers);
    app.sandbox.refunds.respondWith("FAILED");
    await app.payments.dispatchRefunds();

    await db.payout.create({
      data: {
        bookingId,
        ownerId: owner.userId,
        grossRentalPaise: 450_000,
        commissionPaise: 67_500,
        netPaise: 382_500,
        status: "FAILED",
        failureReason: "UPI transfer reversed",
      },
    });
    await db.providerEvent.create({
      data: {
        provider: "sandbox",
        providerEventId: "evt_failed",
        eventType: "payment.captured",
        payload: {},
        status: "FAILED",
        lastError: "boom",
      },
    });
    // A second booking whose capture keeps failing.
    const other = await paidBooking();
    await db.$executeRaw`UPDATE payments SET status = 'AUTHORIZED', captured_at = NULL, capture_attempts = 3
                         WHERE id = ${other.payment.id}::uuid`;

    const health = await money.monitor();
    expect(health.ok).toBe(false);
    expect([...health.attention].sort()).toEqual([
      "authorizationsWaiting",
      "payoutsFailed",
      "providerEventsFailed",
      "refundsFailed",
      "unexpectedCapturesOutstanding",
    ]);
    expect(health.counts).toMatchObject({
      refundsFailed: 1,
      payoutsFailed: 1,
      authorizationsWaiting: 1,
      providerEventsFailed: 1,
    });
    expect(payment.status).toBe("CAPTURED");
  });

  it("flags an open chargeback, and only reports a lost one", async () => {
    const { app, admin, payment } = await paidBooking();
    const dispute = (status: "created" | "lost") =>
      app.sandbox.webhooks.dispute(status, {
        disputeId: "disp_1",
        paymentId: payment.providerPaymentId!,
        amountPaise: payment.amountPaise,
      });
    const opened = dispute("created");
    await app.payments.handleWebhook(opened.body, opened.headers);
    const open = await money.health(admin);
    expect(open.attention).toEqual(["chargebacksOpen"]);
    expect(open.lists.chargebacks).toHaveLength(1);

    const lost = dispute("lost");
    await app.payments.handleWebhook(lost.body, lost.headers);
    expect(await money.monitor()).toMatchObject({
      ok: true,
      counts: { chargebacksOpen: 0, chargebacksLostRecently: 1 },
    });
  });
});

describe("money timeline", () => {
  it("lists a booking's money events in order, with its payment and chargebacks", async () => {
    const { app, admin, orderId, bookingId, payment } = await paidBooking();
    const stray = await app.sandbox.simulate(orderId, "pay-captured");
    await app.payments.handleWebhook(stray.webhooks[0]!.body, stray.webhooks[0]!.headers);
    await app.payments.dispatchRefunds();
    const opened = app.sandbox.webhooks.dispute("created", {
      disputeId: "disp_1",
      paymentId: payment.providerPaymentId!,
      amountPaise: payment.amountPaise,
      reasonCode: "fraudulent",
    });
    await app.payments.handleWebhook(opened.body, opened.headers);

    const timeline = await money.timeline(admin, bookingId);
    expect(timeline.payment).toMatchObject({ status: "CAPTURED", refundedPaise: 0, captureAttempts: 0 });
    expect(timeline.chargebacks).toMatchObject([{ status: "OPEN", reasonCode: "fraudulent" }]);
    expect(timeline.events.map((e) => e.action)).toEqual([
      "payment.reversalQueued",
      "refund.processed",
      "dispute.open",
    ]);
    // Another booking's events never appear.
    const other = await paidBooking();
    expect((await money.timeline(other.admin, other.bookingId)).events).toEqual([]);
  });
});
