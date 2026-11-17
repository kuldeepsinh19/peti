/**
 * POC hardening (docs/audits/POC-HARDENING-REPORT.md): regression tests for the defects fixed in that pass.
 * Each test names the finding it protects.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { prismaNotificationWriter } from "@/modules/notifications/infrastructure/notification-writer";
import { usersUseCases } from "@/modules/users";
import { prismaUserRepository } from "@/modules/users/infrastructure/prisma-user-repository";
import type { UserActor } from "@/shared/application/actor";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { listingsUseCases } from "@/modules/listings";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import { buildApp, clock, memoryPhotos } from "../support/app";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { db, insertBookingRow, resetDatabase } from "../support/db";
import { listingSetup, publishListing } from "../support/listing-fixtures";

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

describe("handover integrity (#5, #6)", () => {
  async function paidRental() {
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
    return { app, ...s, bookingId };
  }
  const reportVersion = async (bookingId: string) =>
    (
      await db.conditionReport.findUniqueOrThrow({
        where: { bookingId_kind: { bookingId, kind: "HANDOVER" } },
      })
    ).updatedAt.toISOString();

  it("tells the renter the handover was recorded, so they know to acknowledge it", async () => {
    const { app, owner, renter, bookingId } = await paidRental();
    await app.bookings.submitHandoverReport(owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
    const notices = await db.notification.findMany({
      where: { userId: renter.userId, type: "booking.handoverRecorded" },
    });
    expect(notices.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    expect(notices[0]!.link).toBe(`/account/rentals/${bookingId}`);
  });

  it("refuses an acknowledgement of a report the owner has since replaced", async () => {
    const { app, owner, renter, bookingId } = await paidRental();
    await app.bookings.submitHandoverReport(owner, { bookingId, grade: "GOOD", notes: "Set A." }, photos(3));
    const seen = await reportVersion(bookingId);
    await new Promise((r) => setTimeout(r, 5));
    await app.bookings.submitHandoverReport(owner, { bookingId, grade: "FAIR", notes: "Set B." }, photos(3));

    await expect(
      app.bookings.acknowledgeHandover(renter, { bookingId, reportVersion: seen }),
    ).rejects.toMatchObject({ code: "REPORT_CHANGED" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CONFIRMED");

    await app.bookings.acknowledgeHandover(renter, {
      bookingId,
      reportVersion: await reportVersion(bookingId),
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ACTIVE");
  });
});

describe("editing a published listing (#8)", () => {
  it("does not stop the owner approving requests that were already waiting", async () => {
    const app = buildBookingApp();
    const s = await scenario();
    const { bookingId } = await app.bookings.request(s.renter, {
      outfitId: s.outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    // Mark the seeded outfit as published, as approval would.
    await db.outfit.update({ where: { id: s.outfit.id }, data: { publishedAt: new Date() } });
    await db.outfit.update({ where: { id: s.outfit.id }, data: { status: "PENDING_REVIEW" } });

    await app.bookings.approve(s.owner, { bookingId });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      "AWAITING_PAYMENT",
    );
  });

  it("brings a paused listing back paused after its edit is approved", async () => {
    const app = buildApp();
    const { owner, admin, form } = await listingSetup();
    const { id } = await app.listings.createListing(owner, form);
    for (let i = 0; i < 3; i++) await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });
    await app.listings.approve(admin, { outfitId: id });
    await app.listings.pause(owner, { outfitId: id });

    await app.listings.updateListing(owner, id, { ...form, title: "Ivory sherwani, newly altered" });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_REVIEW");
    await app.listings.approve(admin, { outfitId: id });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("PAUSED");

    // An edit made while live goes back live.
    await app.listings.resume(owner, { outfitId: id });
    await app.listings.updateListing(owner, id, { ...form, title: "Ivory sherwani, altered again" });
    await app.listings.approve(admin, { outfitId: id });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  });
});

describe("an outfit never published", () => {
  it("cannot have a request approved while it is in review", async () => {
    const app = buildBookingApp();
    const s = await scenario();
    const { bookingId } = await app.bookings.request(s.renter, {
      outfitId: s.outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await db.outfit.update({
      where: { id: s.outfit.id },
      data: { status: "PENDING_REVIEW", publishedAt: null },
    });
    await expect(app.bookings.approve(s.owner, { bookingId })).rejects.toMatchObject({
      code: "OUTFIT_UNAVAILABLE",
    });
  });
});

describe("the price the renter saw (#9)", () => {
  it("refuses a request whose quoted price or deposit no longer matches the listing", async () => {
    const app = buildBookingApp();
    const s = await scenario();
    const option = await db.outfitPriceOption.findFirstOrThrow({
      where: { outfitId: s.outfit.id, durationDays: 3 },
    });
    const outfit = await db.outfit.findUniqueOrThrow({ where: { id: s.outfit.id } });
    const request = (quote: { quotedPricePaise: number; quotedDepositPaise: number }) =>
      app.bookings.request(s.renter, {
        outfitId: s.outfit.id,
        startDate: "2026-12-10",
        days: 3,
        acceptTerms: "on",
        ...quote,
      });

    // The owner raises the deposit after the renter opened the page.
    await db.outfit.update({
      where: { id: s.outfit.id },
      data: { depositPaise: outfit.depositPaise + 100_000 },
    });
    await expect(
      request({ quotedPricePaise: option.pricePaise, quotedDepositPaise: outfit.depositPaise }),
    ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    expect(await db.booking.count()).toBe(0);

    const { bookingId } = await request({
      quotedPricePaise: option.pricePaise,
      quotedDepositPaise: outfit.depositPaise + 100_000,
    });
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({
      depositPaise: outfit.depositPaise + 100_000,
    });
  });
});

describe("a category hidden by an administrator (#10)", () => {
  it("does not stop the owner changing prices on a listing already in it", async () => {
    const app = buildApp();
    const { owner, admin, form, category } = await listingSetup();
    const { id } = await app.listings.createListing(owner, form);
    for (let i = 0; i < 3; i++) await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });
    await app.listings.approve(admin, { outfitId: id });
    await db.outfitCategory.update({ where: { id: category.id }, data: { isActive: false } });

    await app.listings.updateListing(owner, id, { ...form, price3: "3900" });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).minPricePaise).toBe(390_000);

    // Moving a listing *into* a hidden category is still refused.
    const { id: other } = await app.listings.createListing(owner, {
      ...form,
      categoryId: (
        await db.outfitCategory.create({ data: { slug: "other-x", name: "Other X", audience: "MEN" } })
      ).id,
    });
    await expect(app.listings.updateListing(owner, other, { ...form })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("an administrator's dispute decision (#11)", () => {
  it("accepts amounts in rupees and paise, such as an exact late fee", async () => {
    const { app, owner, admin, bookingId } = await returnedRental();
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: "5000",
    });
    await app.bookings.resolveDispute(admin, {
      bookingId,
      outcome: "COMPLETE",
      depositWithheldRupees: "214.29",
      retainedFeeRupees: "4500",
      notes: "A small tear, repair estimated at the stated amount.",
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { deposit: true } });
    expect(b.deposit?.withheldPaise).toBe(21_429);
    await expect(
      app.bookings.resolveDispute(admin, {
        bookingId,
        outcome: "COMPLETE",
        depositWithheldRupees: "1.005",
        retainedFeeRupees: "0",
        notes: "Fractions of a paisa are refused.",
      }),
    ).rejects.toBeTruthy();
  });
});

describe("the completion notice (#12)", () => {
  it("never promises a deposit refund when the whole deposit was withheld", async () => {
    const { app, owner, renter, bookingId } = await returnedRental();
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: String(booking.depositPaise / 100),
    });
    await app.bookings.acceptClaim(renter, { bookingId });
    const completed = await db.notification.findFirstOrThrow({
      where: { userId: renter.userId, channel: "IN_APP", subject: { startsWith: "Completed" } },
    });
    expect(completed.body).not.toMatch(/deposit refund has been initiated/i);
  });
});

describe("payout account changes (#13)", () => {
  it("are audited and the account holder is told", async () => {
    const { owner, ownerUser } = await listingSetup();
    const users = usersUseCases({
      users: prismaUserRepository(db),
      audit: prismaAuditLog(db),
      notifications: prismaNotificationWriter(db),
    });
    await users.savePayoutAccount(owner, { upiVpa: "owner.one@okbank", accountHolderName: "Owner One" });
    await users.savePayoutAccount(owner, { upiVpa: "someone.else@okbank", accountHolderName: "Owner One" });

    const audits = await db.auditLog.findMany({
      where: { entityId: ownerUser.id, action: "user.payoutAccount" },
    });
    expect(audits).toHaveLength(2);
    expect(audits[1]!.after).toMatchObject({ upiVpa: "someone.else@okbank" });
    const notices = await db.notification.findMany({
      where: { userId: ownerUser.id, type: "account.payoutAccountChanged" },
    });
    expect(notices.map((n) => n.channel).sort()).toEqual(["EMAIL", "EMAIL", "IN_APP", "IN_APP"]);
  });
});

describe("removing an address (#14)", () => {
  it("is refused while a listing collects from it", async () => {
    const app = buildApp();
    const { owner, form } = await listingSetup();
    await app.listings.createListing(owner, form);
    const users = usersUseCases({ users: prismaUserRepository(db) });
    await expect(
      users.removeAddress(owner, { addressId: String(form.pickupAddressId) }),
    ).rejects.toMatchObject({ code: "ADDRESS_IN_USE" });
    expect(await db.address.findUniqueOrThrow({ where: { id: String(form.pickupAddressId) } })).toMatchObject(
      {
        deletedAt: null,
      },
    );
  });
});

describe("adding addresses at once (#20)", () => {
  it("never keeps more than five, and only one is the default", async () => {
    const { owner, ownerUser, locality } = await listingSetup();
    await db.address.deleteMany({ where: { userId: ownerUser.id } });
    const users = usersUseCases({ users: prismaUserRepository(db) });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        users.addAddress(owner, {
          line1: `${i + 1} Test Society`,
          localityId: locality.id,
          pincode: "380015",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect(r).toMatchObject({ reason: { code: "ADDRESS_LIMIT" } });
    }
    const rows = await db.address.findMany({ where: { userId: ownerUser.id, deletedAt: null } });
    expect(rows).toHaveLength(5);
    expect(rows.filter((a) => a.isDefault)).toHaveLength(1);
  });
});

describe("contesting a late fee (#22)", () => {
  it("is refused when the rental came back on time and no fee was charged", async () => {
    const { app, renter, bookingId } = await returnedRental();
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).lateFeePaise ?? 0).toBe(0);
    await expect(
      app.bookings.openDispute(renter, {
        bookingId,
        kind: "LATE_FEE_CONTESTED",
        description: "I returned it on the day it was due, so there is nothing to pay.",
      }),
    ).rejects.toMatchObject({ code: "NO_LATE_FEE" });
    expect(await db.dispute.count({ where: { bookingId } })).toBe(0);
  });
});

describe("contact details after a rental (#15)", () => {
  it("are hidden two weeks after completion", async () => {
    const { app, owner, renter, bookingId } = await returnedRental();
    await app.bookings.confirmReturn(owner, { bookingId });
    expect((await app.bookings.detail(renter, bookingId)).owner.phone).not.toBeNull();

    app.clock.advance(15 * 24 * 60 * 60 * 1000);
    const later = await app.bookings.detail(renter, bookingId);
    expect(later.owner.phone).toBeNull();
    expect(later.pickupAddress).toBeNull();
    expect((await app.bookings.detail(owner, bookingId)).renter.phone).toBeNull();
  });
});

describe("suspending a member with open bookings (#16)", () => {
  it("tells the other side of each open booking", async () => {
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
    const adminCases = adminUseCases({
      admin: prismaAdminRepository(db),
      audit: prismaAuditLog(db),
      clock: app.clock,
      notifications: prismaNotificationWriter(db),
    });
    await adminCases.suspendUser(s.admin, { userId: s.owner.userId, reason: "Repeated no-shows reported." });
    const notices = await db.notification.findMany({
      where: { userId: s.renter.userId, type: "booking.counterpartySuspended" },
    });
    expect(notices.length).toBe(2);
    expect(notices[0]!.link).toBe(`/account/rentals/${bookingId}`);
  });
});

describe("notifications that were missing (#27, #28, #29)", () => {
  it("tells the owner their payout was paid, with the reference", async () => {
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
      notifications: prismaNotificationWriter(db),
    });
    await adminCases.markPayoutPaid(admin, { payoutId: payout.id, reference: "UTR123456789" });
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: owner.userId, type: "payout.paid", channel: "IN_APP" },
    });
    expect(notice.body).toContain("UTR123456789");
  });

  it("tells the other party about a new dispute message", async () => {
    const { app, owner, renter, bookingId } = await returnedRental();
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: "2000",
    });
    await app.bookings.addDisputeMessage(renter, { bookingId, body: "The tear was there at handover." });
    expect(
      await db.notification.count({ where: { userId: owner.userId, type: "dispute.message" } }),
    ).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { userId: renter.userId, type: "dispute.message" } })).toBe(
      0,
    );
  });

  it("tells the owner when a suspended listing is reinstated", async () => {
    const listingApp = listingsUseCases({
      listings: prismaListingRepository(db),
      photos: memoryPhotos,
      audit: prismaAuditLog(db),
      clock,
      notifications: prismaNotificationWriter(db),
    });
    const { owner, admin, form } = await listingSetup();
    const { id } = await listingApp.createListing(owner, form);
    for (let i = 0; i < 3; i++) await listingApp.addPhoto(owner, id, new Uint8Array([1]), "");
    await listingApp.submitForReview(owner, { outfitId: id });
    await listingApp.approve(admin, { outfitId: id });
    await listingApp.suspend(admin, { outfitId: id, note: "Checking a report about this listing." });
    await listingApp.reinstate(admin, { outfitId: id });
    expect(
      await db.notification.count({ where: { userId: owner.userId, type: "listing.reinstate" } }),
    ).toBeGreaterThan(0);
  });
});

describe("photograph counts under concurrent requests (#18, #19, decision 3)", () => {
  it("two removals at once never leave a published listing below three photographs", async () => {
    const app = buildApp();
    const s = await listingSetup();
    const id = await publishListing(app, s.form, s.owner, s.admin);
    await app.listings.addPhoto(s.owner, id, new Uint8Array([1]), "");
    const rows = await db.outfitImage.findMany({ where: { outfitId: id }, select: { id: true } });
    expect(rows).toHaveLength(4);

    const results = await Promise.allSettled(
      rows.slice(0, 2).map((r) => app.listings.removePhoto(s.owner, { outfitId: id, photoId: r.id })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "LISTING_NEEDS_PHOTOS" },
    });
    expect(await db.outfitImage.count({ where: { outfitId: id } })).toBe(3);
  });

  it("uploads at once never take a listing past eight photographs", async () => {
    const app = buildApp();
    const s = await listingSetup();
    const { id } = await app.listings.createListing(s.owner, s.form);
    for (let i = 0; i < 6; i++) await app.listings.addPhoto(s.owner, id, new Uint8Array([1]), "");

    const results = await Promise.allSettled(
      [0, 1, 2, 3].map(() => app.listings.addPhoto(s.owner, id, new Uint8Array([1]), "")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect(r).toMatchObject({ reason: { code: "TOO_MANY_PHOTOS" } });
    }
    expect(await db.outfitImage.count({ where: { outfitId: id } })).toBe(8);
  });

  it("a draft may have fewer than three photographs, but cannot be submitted with them", async () => {
    const app = buildApp();
    const s = await listingSetup();
    const { id } = await app.listings.createListing(s.owner, s.form);
    await app.listings.addPhoto(s.owner, id, new Uint8Array([1]), "");
    const [only] = await db.outfitImage.findMany({ where: { outfitId: id }, select: { id: true } });
    await app.listings.removePhoto(s.owner, { outfitId: id, photoId: only!.id });
    expect(await db.outfitImage.count({ where: { outfitId: id } })).toBe(0);
    await expect(app.listings.submitForReview(s.owner, { outfitId: id })).rejects.toMatchObject({
      code: "LISTING_NEEDS_PHOTOS",
    });
  });
});

describe("a malformed id in the address bar (#24)", () => {
  it("is not found, not a server error", async () => {
    const app = buildApp();
    const bookingApp = buildBookingApp();
    const s = await listingSetup();
    for (const id of ["not-a-uuid", "1", "' OR 1=1 --"]) {
      await expect(app.listings.getForEdit(s.owner, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(bookingApp.bookings.detail(s.owner, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("photographs of a listing that is not published (#25)", () => {
  it("are shown only to its owner, administrators and renters who booked it", async () => {
    const app = buildApp();
    const s = await listingSetup();
    const { id } = await app.listings.createListing(s.owner, s.form);
    for (let i = 0; i < 3; i++) await app.listings.addPhoto(s.owner, id, new Uint8Array([1]), "");
    const { storageKey } = await db.outfitImage.findFirstOrThrow({ where: { outfitId: id } });
    const as = (actor: UserActor | null) => app.listings.photoVisibility(storageKey, async () => actor);

    // A draft.
    expect(await as(null)).toBeNull();
    expect(await as(s.stranger)).toBeNull();
    expect(await as(s.owner)).toBe("private");
    expect(await as(s.admin)).toBe("private");

    // Published: anyone, and cacheable.
    await app.listings.submitForReview(s.owner, { outfitId: id });
    await app.listings.approve(s.admin, { outfitId: id });
    expect(await as(null)).toBe("public");
    // ...unless its owner is suspended (search hides those listings too).
    await db.user.update({ where: { id: s.owner.userId }, data: { banned: true } });
    expect(await as(null)).toBeNull();
    expect(await as(s.admin)).toBe("private");
    await db.user.update({ where: { id: s.owner.userId }, data: { banned: false } });

    // Paused: a renter who booked it still sees it on their booking page; others do not.
    await db.outfit.update({ where: { id }, data: { status: "PAUSED" } });
    expect(await as(null)).toBeNull();
    expect(await as(s.stranger)).toBeNull();
    await insertBookingRow({ outfitId: id, ownerId: s.owner.userId, renterId: s.stranger.userId });
    expect(await as(s.stranger)).toBe("private");
  });

  it("are not served for a key that is no listing's photograph", async () => {
    const app = buildApp();
    const s = await listingSetup();
    expect(await app.listings.photoVisibility("outfits/x/0.jpg", async () => s.admin)).toBeNull();
  });
});
