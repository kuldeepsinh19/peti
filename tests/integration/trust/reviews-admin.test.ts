import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { reviewsUseCases } from "@/modules/reviews";
import { prismaReviewRepository } from "@/modules/reviews/infrastructure/prisma-review-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { actorFor } from "../support/app";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { createUser, db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

async function completedRental() {
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
  await app.bookings.submitHandoverReport(
    s.owner,
    { bookingId, grade: "EXCELLENT", notes: "Perfect." },
    photos(3),
  );
  await app.bookings.acknowledgeHandover(s.renter, { bookingId });
  app.clock.set("2026-12-12T12:00:00Z");
  await app.bookings.recordReturn(s.owner, { bookingId, grade: "EXCELLENT", notes: "Fine." }, photos(3));
  await app.bookings.confirmReturn(s.owner, { bookingId });
  const reviews = reviewsUseCases({ reviews: prismaReviewRepository(db), clock: app.clock });
  return { app, reviews, ...s, bookingId };
}

describe("verified, double-blind reviews", () => {
  it("only participants of a completed rental can review, once, and reviews publish when both are in", async () => {
    const { reviews, owner, renter, bookingId } = await completedRental();
    const stranger = actorFor(await createUser({ name: "Stranger" }));
    await expect(reviews.submit(stranger, { bookingId, rating: 5 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await reviews.submit(renter, { bookingId, rating: 5, comment: "Beautiful and spotless." });
    await expect(reviews.submit(renter, { bookingId, rating: 4 })).rejects.toMatchObject({
      code: "ALREADY_REVIEWED",
    });
    expect(await db.review.count({ where: { visibleAt: { not: null } } })).toBe(0); // hidden until both review
    expect(await reviews.received(owner)).toHaveLength(0);

    expect(await reviews.submit(owner, { bookingId, rating: 4 })).toEqual({ published: true });
    expect(await db.review.count({ where: { visibleAt: { not: null } } })).toBe(2);
    const ownerProfile = await db.userProfile.findUniqueOrThrow({ where: { userId: owner.userId } });
    expect(ownerProfile).toMatchObject({ ownerRatingSum: 5, ownerRatingCount: 1 });
  });

  it("refuses reviews for unfinished rentals and after the window, and publishes lone reviews when it closes", async () => {
    const { app, reviews, renter, bookingId } = await completedRental();
    await reviews.submit(renter, { bookingId, rating: 3 });
    app.clock.advance(15 * 86_400_000);
    expect(await reviews.publishExpired()).toBe(1);
    expect(await db.review.count({ where: { visibleAt: { not: null } } })).toBe(1);
  });
});

describe("administration", () => {
  it("rejects non-admins, suspends with session revocation, and audits payouts", async () => {
    const { app, owner, admin } = await completedRental();
    const adminCases = adminUseCases({
      admin: prismaAdminRepository(db),
      audit: prismaAuditLog(db),
      clock: app.clock,
    });

    await expect(adminCases.metrics(owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      adminCases.suspendUser(owner, { userId: admin.userId, reason: "Trying it on" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const metrics = await adminCases.metrics(admin);
    expect(metrics.reconciliationIssues).toBe(0);
    expect(metrics.bookings.COMPLETED).toBe(1);

    await db.session.create({
      data: { userId: owner.userId, token: "t-" + Date.now(), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await adminCases.suspendUser(admin, { userId: owner.userId, reason: "Repeated no-shows reported" });
    expect(await db.session.count({ where: { userId: owner.userId } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).banned).toBe(true);

    const [payout] = await adminCases.payouts(admin, "PENDING");
    await expect(
      adminCases.markPayoutPaid(admin, { payoutId: payout!.id, reference: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await adminCases.markPayoutPaid(admin, { payoutId: payout!.id, reference: "UTR123456789" });
    await expect(
      adminCases.markPayoutPaid(admin, { payoutId: payout!.id, reference: "UTR123456789" }),
    ).rejects.toMatchObject({ code: "PAYOUT_NOT_PENDING" });
    const actions = (await db.auditLog.findMany({ orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["user.suspend", "payout.markPaid"]);
  });
});
