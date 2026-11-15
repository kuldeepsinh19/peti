/**
 * Owner payouts and chargebacks (ADR-006): payouts are paid once, can fail and be paid again, and wait while
 * a chargeback is open on the booking's payment.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

/** A completed rental whose owner has a UPI ID: one PENDING payout, ready to be paid. */
async function payableRental() {
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
  app.clock.set("2026-12-10T05:00:00Z");
  await app.bookings.submitHandoverReport(s.owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
  await app.bookings.acknowledgeHandover(s.renter, { bookingId });
  app.clock.set("2026-12-12T12:00:00Z");
  await app.bookings.recordReturn(s.owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
  await app.bookings.confirmReturn(s.owner, { bookingId });
  await db.ownerPayoutAccount.create({
    data: { userId: s.owner.userId, upiVpa: "owner.one@okbank", accountHolderName: "Owner One" },
  });
  const adminCases = adminUseCases({
    admin: prismaAdminRepository(db),
    audit: prismaAuditLog(db),
    clock: app.clock,
  });
  const payout = await db.payout.findFirstOrThrow({ where: { bookingId } });
  const payment = await db.payment.findUniqueOrThrow({ where: { bookingId } });
  return { ...s, app, adminCases, bookingId, payout, payment, orderId: paid.orderId };
}

type Rental = Awaited<ReturnType<typeof payableRental>>;

async function chargeback(
  r: Rental,
  status: "created" | "won" | "lost" | "closed",
  disputeId = "disp_1",
  paymentId = r.payment.providerPaymentId!,
) {
  const w = r.app.sandbox.webhooks.dispute(status, {
    disputeId,
    paymentId,
    amountPaise: r.payment.amountPaise,
    reasonCode: "fraudulent",
  });
  return r.app.payments.handleWebhook(w.body, w.headers);
}

const markPaid = (r: Rental, reference = "UTR123456789") =>
  r.adminCases.markPayoutPaid(r.admin, { payoutId: r.payout.id, reference });

describe("chargebacks", () => {
  it("hold the owner's payout until they are resolved", async () => {
    const r = await payableRental();
    expect(await chargeback(r, "created")).toEqual({ status: 200, body: "ok" });
    expect(await db.paymentDispute.findFirstOrThrow()).toMatchObject({
      status: "OPEN",
      bookingId: r.bookingId,
      paymentId: r.payment.id,
      reasonCode: "fraudulent",
    });

    const [row] = await r.adminCases.payouts(r.admin, "PENDING");
    expect(row).toMatchObject({ id: r.payout.id, onHold: true });
    await expect(markPaid(r)).rejects.toMatchObject({ code: "PAYOUT_ON_HOLD" });
    expect((await db.payout.findUniqueOrThrow({ where: { id: r.payout.id } })).status).toBe("PENDING");

    await chargeback(r, "won");
    await markPaid(r);
    expect((await db.payout.findUniqueOrThrow({ where: { id: r.payout.id } })).status).toBe("PAID");
    expect(
      (await db.auditLog.findMany({ where: { entityType: "payment_dispute" }, orderBy: { id: "asc" } })).map(
        (a) => a.action,
      ),
    ).toEqual(["dispute.open", "dispute.won"]);
  });

  it("are re-checked when the payout is written, not only before", async () => {
    const r = await payableRental();
    await db.paymentDispute.create({
      data: {
        provider: "sandbox",
        providerDisputeId: "disp_race",
        providerPaymentId: r.payment.providerPaymentId!,
        paymentId: r.payment.id,
        bookingId: r.bookingId,
        amountPaise: r.payment.amountPaise,
      },
    });
    // As if the chargeback opened between the use case's check and its write.
    expect(
      await prismaAdminRepository(db).markPayoutPaid(r.payout.id, "UTR1", r.admin.userId, new Date()),
    ).toBe(false);
  });

  it("never reopen, whatever order the events arrive in", async () => {
    const r = await payableRental();
    await chargeback(r, "won", "disp_late"); // the resolution arrives before the opening
    await chargeback(r, "created", "disp_late");
    await chargeback(r, "created", "disp_late"); // and the provider delivers it again
    expect(await db.paymentDispute.findMany()).toMatchObject([{ status: "WON" }]);
    expect(await db.auditLog.count({ where: { entityType: "payment_dispute" } })).toBe(1);
    await markPaid(r);
  });

  it("on a stray payment Peti reversed are linked to the booking", async () => {
    const r = await payableRental();
    const stray = await r.app.sandbox.simulate(r.orderId, "pay-captured");
    await r.app.payments.handleWebhook(stray.webhooks[0]!.body, stray.webhooks[0]!.headers);
    await chargeback(r, "created", "disp_stray", stray.paymentIds[0]);
    expect(await db.paymentDispute.findFirstOrThrow()).toMatchObject({
      bookingId: r.bookingId,
      providerPaymentId: stray.paymentIds[0],
    });
  });
});

describe("payouts", () => {
  it("are paid once, even when two administrators record the same payout at once", async () => {
    const r = await payableRental();
    const results = await Promise.allSettled([markPaid(r, "UTR111111"), markPaid(r, "UTR222222")]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.find((x) => x.status === "rejected")).toMatchObject({
      reason: { code: "PAYOUT_NOT_PENDING" },
    });
    expect(await db.auditLog.count({ where: { action: "payout.markPaid" } })).toBe(1);
  });

  it("are one per booking", async () => {
    const r = await payableRental();
    await expect(
      db.payout.create({
        data: {
          bookingId: r.bookingId,
          ownerId: r.payout.ownerId,
          grossRentalPaise: r.payout.grossRentalPaise,
          commissionPaise: r.payout.commissionPaise,
          netPaise: r.payout.netPaise,
        },
      }),
    ).rejects.toThrow();
  });

  it("that came back are recorded as failed and paid again", async () => {
    const r = await payableRental();
    await markPaid(r, "UTR111111");
    await r.adminCases.recordPayoutFailure(r.admin, {
      payoutId: r.payout.id,
      reason: "UPI transfer reversed: account closed",
    });
    expect(await db.payout.findUniqueOrThrow({ where: { id: r.payout.id } })).toMatchObject({
      status: "FAILED",
      failureReason: "UPI transfer reversed: account closed",
      payoutReference: "UTR111111",
      paidAt: null,
      paidById: null,
    });
    expect(await r.adminCases.payouts(r.admin, "FAILED")).toMatchObject([{ id: r.payout.id }]);
    await expect(
      r.adminCases.recordPayoutFailure(r.admin, { payoutId: r.payout.id, reason: "Again, by mistake" }),
    ).rejects.toMatchObject({ code: "PAYOUT_NOT_PAID" });

    await markPaid(r, "UTR222222");
    expect(await db.payout.findUniqueOrThrow({ where: { id: r.payout.id } })).toMatchObject({
      status: "PAID",
      payoutReference: "UTR222222",
      failureReason: null,
    });
    const actions = (
      await db.auditLog.findMany({ where: { entityId: r.payout.id }, orderBy: { id: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(["payout.markPaid", "payout.failed", "payout.markPaid"]);
  });

  it("are recorded as failed once, even by two administrators at once", async () => {
    const r = await payableRental();
    await markPaid(r);
    const fail = (reason: string) =>
      r.adminCases.recordPayoutFailure(r.admin, { payoutId: r.payout.id, reason });
    const results = await Promise.allSettled([fail("Bounced: first report"), fail("Bounced: second report")]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "payout.failed" } })).toBe(1);
  });

  it("can only be recorded as failed after being paid", async () => {
    const r = await payableRental();
    await expect(
      r.adminCases.recordPayoutFailure(r.admin, { payoutId: r.payout.id, reason: "Never sent" }),
    ).rejects.toMatchObject({ code: "PAYOUT_NOT_PAID" });
  });
});
