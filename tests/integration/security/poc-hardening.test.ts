/**
 * POC hardening (docs/audits/POC-HARDENING-REPORT.md): regression tests for the defects fixed in that pass.
 * Each test names the finding it protects.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import type { UserActor } from "@/shared/application/actor";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildApp } from "../support/app";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";
import { listingSetup } from "../support/listing-fixtures";

beforeEach(async () => {
  await resetDatabase();
});

const asAdmin = (actor: UserActor): UserActor => ({ ...actor, isAdmin: true });

/** A rental the owner has recorded as returned (handover and return reports done). */
async function returnedRental() {
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
  await app.bookings.recordReturn(s.owner, { bookingId, grade: "GOOD", notes: "Torn hem." }, photos(3));
  return { app, ...s, bookingId };
}

describe("administrators acting in their own favour (#3, #4, #35)", () => {
  it("an administrator who owns the outfit cannot decide its dispute", async () => {
    const { app, owner, admin, bookingId } = await returnedRental();
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: "5000",
    });
    const decision = {
      bookingId,
      outcome: "COMPLETE",
      depositWithheldRupees: "5000",
      retainedFeeRupees: "4500",
      notes: "Deciding my own claim",
    };
    await expect(app.bookings.resolveDispute(asAdmin(owner), decision)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("DISPUTED");
    // Another administrator can.
    await app.bookings.resolveDispute(admin, decision);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("COMPLETED");
  });

  it("an administrator cannot record their own payout as paid or failed", async () => {
    const { app, owner, admin, bookingId } = await returnedRental();
    await app.bookings.confirmReturn(owner, { bookingId });
    await db.ownerPayoutAccount.create({
      data: { userId: owner.userId, upiVpa: "owner.one@okbank", accountHolderName: "Owner One" },
    });
    const payout = await db.payout.findFirstOrThrow({ where: { bookingId } });
    const adminCases = adminUseCases({
      admin: prismaAdminRepository(db),
      audit: prismaAuditLog(db),
      clock: app.clock,
    });

    await expect(
      adminCases.markPayoutPaid(asAdmin(owner), { payoutId: payout.id, reference: "UTR123456789" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe("PENDING");

    await adminCases.markPayoutPaid(admin, { payoutId: payout.id, reference: "UTR123456789" });
    await expect(
      adminCases.recordPayoutFailure(asAdmin(owner), { payoutId: payout.id, reason: "Bounced, I say" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe("PAID");
  });

  it("an administrator cannot moderate their own listing", async () => {
    const app = buildApp();
    const { owner, admin, form } = await listingSetup();
    const { id } = await app.listings.createListing(owner, form);
    for (let i = 0; i < 3; i++) await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });

    await expect(app.listings.approve(asAdmin(owner), { outfitId: id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_REVIEW");
    await app.listings.approve(admin, { outfitId: id });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  });
});

describe("accounts left without a profile (#7)", () => {
  it("can still have owner cancellations counted", async () => {
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
    await db.userProfile.delete({ where: { userId: s.owner.userId } });

    await app.bookings.cancel(s.owner, { bookingId });
    expect(await db.userProfile.findUniqueOrThrow({ where: { userId: s.owner.userId } })).toMatchObject({
      ownerCancellationCount: 1,
    });
  });
});
