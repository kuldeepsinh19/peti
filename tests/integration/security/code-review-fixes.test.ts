/**
 * Regression tests for the code review of 2026-11-13
 * (docs/architecture/security-architecture.md, "Code review 2026-11-13"). Each test names what it protects.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { paymentsUseCases } from "@/modules/payments";
import { prismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

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
  await app.payThroughSandbox(s.renter, bookingId);
  return { app, ...s, bookingId };
}

async function returnedBooking() {
  const booked = await paidBooking("2026-12-10"); // 10–12 Dec
  const { app, owner, renter, bookingId } = booked;
  app.clock.set("2026-12-10T05:00:00Z");
  await app.bookings.submitHandoverReport(
    owner,
    { bookingId, grade: "EXCELLENT", notes: "Perfect." },
    photos(3),
  );
  await app.bookings.acknowledgeHandover(renter, { bookingId });
  app.clock.set("2026-12-13T12:00:00Z");
  await app.bookings.recordReturn(owner, { bookingId, grade: "GOOD", notes: "A day late." }, photos(3));
  return booked;
}

describe("claim amounts", () => {
  it("are only accepted on damage or missing-item disputes, and within a sane range", async () => {
    const { app, owner, renter, bookingId } = await returnedBooking();
    await expect(
      app.bookings.openDispute(renter, {
        bookingId,
        kind: "LATE_FEE_CONTESTED",
        description: "I returned it on time; the owner was not home to receive it.",
        claimedRupees: "500",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      app.bookings.openDispute(owner, {
        bookingId,
        kind: "DAMAGE",
        description: "The hem is torn along twenty centimetres.",
        claimedRupees: "99999999999",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("only an owner's claim can be settled by the other side accepting it", async () => {
    const { app, owner, renter, bookingId } = await returnedBooking();
    // The renter contests the late fee: not a claim on the deposit, so the owner cannot "accept" it.
    await app.bookings.openDispute(renter, {
      bookingId,
      kind: "LATE_FEE_CONTESTED",
      description: "I returned it on time; the owner was not home to receive it.",
    });
    await expect(app.bookings.acceptClaim(owner, { bookingId })).rejects.toMatchObject({
      code: "NEEDS_ADMIN",
    });
  });
});

describe("refunds the provider rejects", () => {
  it("are marked FAILED, listed for an administrator, and sent again after a retry", async () => {
    const { app, renter, admin, bookingId } = await paidBooking();
    await app.bookings.cancel(renter, { bookingId });

    let providerRejects = true;
    const provider = {
      ...app.sandbox.provider,
      createRefund: async (input: Parameters<typeof app.sandbox.provider.createRefund>[0]) =>
        providerRejects
          ? { providerRefundId: "rfnd_rejected", status: "FAILED" as const }
          : app.sandbox.provider.createRefund(input),
    };
    const payments = paymentsUseCases({
      provider,
      payments: prismaPaymentRepository(db),
      bookings: app.bookings,
      clock: app.clock,
      appUrl: "http://localhost:3100",
      audit: prismaAuditLog(db),
    });

    expect(await payments.dispatchRefunds()).toMatchObject({ claimed: 1, sent: 0 });
    const refund = await db.refund.findFirstOrThrow({ where: { payment: { bookingId } } });
    expect(refund).toMatchObject({ status: "FAILED", providerRefundId: null });

    const adminCases = adminUseCases({
      admin: prismaAdminRepository(db),
      audit: prismaAuditLog(db),
      clock: app.clock,
    });
    expect((await adminCases.failedRefunds(admin)).map((r) => r.id)).toEqual([refund.id]);
    await adminCases.retryRefund(admin, { refundId: refund.id });

    providerRejects = false;
    expect(await payments.dispatchRefunds()).toMatchObject({ claimed: 1, sent: 1 });
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
      status: "PROCESSED",
    });
  });
});
