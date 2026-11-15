/**
 * Regression tests for Phase 1 hardening (docs/audits/PHASE-1-REMEDIATION-REPORT.md). Auth-endpoint
 * fixes are covered in tests/integration/auth/auth-hardening.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { usersUseCases } from "@/modules/users";
import { prismaUserRepository } from "@/modules/users/infrastructure/prisma-user-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

/** A completed rental, which leaves one PENDING payout owed to the owner. */
async function pendingPayout() {
  const app = buildBookingApp();
  const s = await scenario();
  const { bookingId } = await app.bookings.request(s.renter, {
    outfitId: s.outfit.id,
    startDate: "2026-12-10",
    days: 3,
    acceptTerms: "on",
  });
  await app.bookings.approve(s.owner, { bookingId });
  await app.payThroughSandbox(s.renter, bookingId);
  app.clock.set("2026-12-10T05:00:00Z");
  await app.bookings.submitHandoverReport(s.owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
  await app.bookings.acknowledgeHandover(s.renter, { bookingId });
  app.clock.set("2026-12-12T12:00:00Z");
  await app.bookings.recordReturn(s.owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
  await app.bookings.confirmReturn(s.owner, { bookingId });
  const adminCases = adminUseCases({
    admin: prismaAdminRepository(db),
    audit: prismaAuditLog(db),
    clock: app.clock,
  });
  const payout = await db.payout.findFirstOrThrow({ where: { bookingId } });
  return { ...s, adminCases, payout };
}

describe("payouts need the owner's valid UPI ID (S-12)", () => {
  it("cannot be marked paid while the owner has no UPI ID; nothing changes and nothing is audited", async () => {
    const { adminCases, admin, payout } = await pendingPayout();
    await expect(
      adminCases.markPayoutPaid(admin, { payoutId: payout.id, reference: "UTR123456789" }),
    ).rejects.toMatchObject({ code: "NO_PAYOUT_ACCOUNT" });
    expect(await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({
      status: "PENDING",
      payoutReference: null,
      paidById: null,
    });
    expect(await db.auditLog.count({ where: { action: "payout.markPaid" } })).toBe(0);
  });

  it("refuses a stored UPI ID that is not valid", async () => {
    const { adminCases, admin, owner, payout } = await pendingPayout();
    await db.ownerPayoutAccount.create({
      data: { userId: owner.userId, upiVpa: "not a upi id", accountHolderName: "Owner One" },
    });
    await expect(
      adminCases.markPayoutPaid(admin, { payoutId: payout.id, reference: "UTR123456789" }),
    ).rejects.toMatchObject({ code: "NO_PAYOUT_ACCOUNT" });
  });

  it("goes through once the owner saves one, and the audit entry records where the money went", async () => {
    const { adminCases, admin, owner, payout } = await pendingPayout();
    const users = usersUseCases({ users: prismaUserRepository(db) });
    await users.savePayoutAccount(owner, { upiVpa: "Owner.One@OKBank", accountHolderName: "Owner One" });
    await adminCases.markPayoutPaid(admin, { payoutId: payout.id, reference: "UTR123456789" });
    expect(await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({
      status: "PAID",
      payoutReference: "UTR123456789",
    });
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "payout.markPaid" } });
    expect(entry.after).toMatchObject({ upiVpa: "owner.one@okbank" });
  });
});
