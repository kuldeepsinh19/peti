/**
 * Regression tests for the code review of 2026-11-13
 * (docs/architecture/security-architecture.md, "Code review 2026-11-13"). Each test names what it protects.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { dispatchPendingEmails } from "@/modules/notifications";
import { prismaNotificationOutbox } from "@/modules/notifications/infrastructure/notification-outbox";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import { paymentsUseCases } from "@/modules/payments";
import { prismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";
import { reviewsUseCases } from "@/modules/reviews";
import { prismaReviewRepository } from "@/modules/reviews/infrastructure/prisma-review-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { actorFor, buildApp } from "../support/app";
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

describe("reviews under concurrency", () => {
  async function completedRental() {
    const booked = await returnedBooking();
    await booked.app.bookings.confirmReturn(booked.owner, { bookingId: booked.bookingId });
    const reviews = reviewsUseCases({ reviews: prismaReviewRepository(db), clock: booked.app.clock });
    return { ...booked, reviews };
  }
  const ratings = async (userId: string) =>
    db.userProfile.findUniqueOrThrow({
      where: { userId },
      select: { ownerRatingCount: true, ownerRatingSum: true, renterRatingCount: true },
    });

  it("publish both reviews when both people submit at the same moment", async () => {
    const { reviews, owner, renter, bookingId } = await completedRental();
    await Promise.all([
      reviews.submit(renter, { bookingId, rating: 5, comment: "Beautiful and spotless." }),
      reviews.submit(owner, { bookingId, rating: 4 }),
    ]);
    expect(await db.review.count({ where: { bookingId, visibleAt: null } })).toBe(0);
    expect(await ratings(owner.userId)).toMatchObject({ ownerRatingCount: 1, ownerRatingSum: 5 });
    expect(await ratings(renter.userId)).toMatchObject({ renterRatingCount: 1 });
  });

  it("turn a double submission into ALREADY_REVIEWED, not an internal error", async () => {
    const { reviews, renter, bookingId } = await completedRental();
    const results = await Promise.allSettled([
      reviews.submit(renter, { bookingId, rating: 5 }),
      reviews.submit(renter, { bookingId, rating: 5 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ALREADY_REVIEWED" },
    });
  });

  it("count a lone review once even when two sweeps publish it at the same moment", async () => {
    const { app, reviews, owner, renter, bookingId } = await completedRental();
    await reviews.submit(renter, { bookingId, rating: 3 });
    app.clock.set("2027-01-10T06:30:00Z"); // well past the 14-day window
    const counts = await Promise.all([reviews.publishExpired(), reviews.publishExpired()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await ratings(owner.userId)).toMatchObject({ ownerRatingCount: 1, ownerRatingSum: 3 });
  });
});

describe("email outbox", () => {
  it("tries a failing email once per run and keeps the others moving", async () => {
    const user = await createUser();
    await db.notification.createMany({
      data: ["bounces", "fine"].map((subject) => ({
        userId: user.id,
        channel: "EMAIL" as const,
        type: "test",
        subject,
        body: "Body",
        dedupeKey: `test:${user.id}:${subject}`,
      })),
    });
    const sent: string[] = [];
    const mail = {
      async send(m: { subject: string }) {
        if (m.subject === "bounces") throw new Error("SMTP 451 try again later");
        sent.push(m.subject);
      },
    };
    const result = await dispatchPendingEmails(prismaNotificationOutbox(db), mail, "http://localhost");
    expect(result).toEqual({ claimed: 2, sent: 1 });
    expect(sent).toEqual(["fine"]);
    expect(await db.notification.findFirstOrThrow({ where: { subject: "bounces" } })).toMatchObject({
      status: "PENDING",
      attempts: 1,
    });
  });
});

describe("listings", () => {
  it("cannot be approved without a photograph", async () => {
    const { listings } = buildApp();
    const admin = actorFor(await createUser({ name: "Admin", role: "admin" }));
    const outfit = await createOutfit({ status: "PENDING_REVIEW" });
    await expect(listings.approve(admin, { outfitId: outfit.id })).rejects.toMatchObject({
      code: "LISTING_NEEDS_PHOTOS",
    });
  });

  it("keep their last photograph while waiting for review", async () => {
    const { listings } = buildApp();
    const ownerUser = await createUser({ name: "Owner" });
    const outfit = await createOutfit({ ownerId: ownerUser.id, status: "PENDING_REVIEW", photos: 1 });
    await expect(
      listings.removePhoto(actorFor(ownerUser), { outfitId: outfit.id, photoId: outfit.images[0]!.id }),
    ).rejects.toMatchObject({ code: "LISTING_NEEDS_PHOTOS" });
  });

  it("an edit saved after a suspension cannot undo it", async () => {
    const outfit = await createOutfit({ status: "ACTIVE", photos: 1 });
    const repo = prismaListingRepository(db);
    const address = await db.address.create({
      data: {
        userId: outfit.ownerId,
        line1: "12 Test Society",
        localityId: outfit.localityId,
        pincode: "380015",
      },
    });
    const edit = { ...(await repo.getForEdit(outfit.id))!, pickupAddressId: address.id };
    // The owner read ACTIVE; an administrator suspends before the save lands.
    await db.outfit.update({ where: { id: outfit.id }, data: { status: "SUSPENDED" } });
    expect(await repo.update(outfit.id, { ...edit, title: "Renamed" }, "ACTIVE", "PENDING_REVIEW")).toBe(
      false,
    );
    expect(await db.outfit.findUniqueOrThrow({ where: { id: outfit.id } })).toMatchObject({
      status: "SUSPENDED",
      title: outfit.title,
    });
  });
});

describe("administrators who are part of a rental", () => {
  it("act as that participant, without administrator overrides", async () => {
    const app = buildBookingApp();
    const s = await scenario();
    const adminRenter = { ...s.renter, isAdmin: true };
    const { bookingId } = await app.bookings.request(adminRenter, {
      outfitId: s.outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(s.owner, { bookingId });
    await app.payThroughSandbox(adminRenter, bookingId);
    app.clock.set("2026-12-10T05:00:00Z");
    await app.bookings.submitHandoverReport(s.owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
    await app.bookings.acknowledgeHandover(adminRenter, { bookingId });
    // Recording the return (and choosing its date, i.e. waiving a late fee) is the owner's or a neutral
    // administrator's job, never the renter's, even if the renter is an administrator.
    app.clock.set("2026-12-15T12:00:00Z");
    await expect(
      app.bookings.recordReturn(
        adminRenter,
        { bookingId, grade: "EXCELLENT", notes: "Returned on time.", returnedOn: "2026-12-12" },
        photos(3),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
