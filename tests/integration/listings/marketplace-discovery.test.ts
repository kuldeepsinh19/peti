/**
 * Phase 3 renter discovery: what Explore outfits shows, how it filters, and the lender trust shown on cards.
 * Listing rules for owners are in owner-experience.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../support/app";
import { createCategory, createLocality, db, resetDatabase } from "../support/db";
import { buildBookingApp, photos, scenario } from "../support/booking-app";
import { listingSetup, publishListing } from "../support/listing-fixtures";

const app = buildApp();

beforeEach(async () => {
  await resetDatabase();
});

const ids = async (params: Record<string, string>) =>
  (await app.search.explore(params).result).items.map((i) => i.id).sort();

describe("Explore outfits", () => {
  it("shows only published outfits: never drafts, pending, paused or rejected ones", async () => {
    const { owner, admin, form } = await listingSetup();
    const published = await publishListing(app, form, owner, admin);
    const paused = await publishListing(app, { ...form, title: "Paused bandhgala in navy" }, owner, admin);
    await app.listings.pause(owner, { outfitId: paused });

    const rejected = (await app.listings.createListing(owner, { ...form, title: "Rejected kurta set" })).id;
    await app.listings.addPhoto(owner, rejected, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: rejected });
    await app.listings.reject(admin, { outfitId: rejected, note: "The photographs are too dark." });

    const pending = (await app.listings.createListing(owner, { ...form, title: "Pending anarkali gown" })).id;
    await app.listings.addPhoto(owner, pending, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: pending });
    await app.listings.createListing(owner, { ...form, title: "Draft indo-western jacket" });

    expect(await ids({})).toEqual([published]);
    // Their pages are hidden from renters too (the owner can still open them).
    for (const id of [paused, rejected, pending]) {
      const { slug } = await db.outfit.findUniqueOrThrow({ where: { id } });
      await expect(app.search.outfit(null, slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(app.search.outfit(owner, slug)).resolves.toMatchObject({ id });
    }

    // Resuming publishes it again.
    await app.listings.resume(owner, { outfitId: paused });
    expect(await ids({})).toEqual([published, paused].sort());
  });

  it("filters by category, locality and a price range, and searches by outfit name", async () => {
    const { owner, admin, form } = await listingSetup();
    const [otherCategory, otherLocality] = await Promise.all([createCategory(), createLocality()]);
    const sherwani = await publishListing(app, form, owner, admin); // ₹3,500 for 3 days
    const lehenga = await publishListing(
      app,
      {
        ...form,
        title: "Dusty rose bridal lehenga",
        categoryId: otherCategory.id,
        localityId: otherLocality.id,
        price3: "9000",
        price5: "12000",
        retailValueRupees: "70000",
      },
      owner,
      admin,
    );
    const category = await db.outfitCategory.findUniqueOrThrow({ where: { id: String(form.categoryId) } });
    const locality = await db.locality.findUniqueOrThrow({ where: { id: String(form.localityId) } });

    expect(await ids({ category: category.slug })).toEqual([sherwani]);
    expect(await ids({ category: otherCategory.slug })).toEqual([lehenga]);
    expect(await ids({ locality: locality.slug })).toEqual([sherwani]);
    expect(await ids({ locality: otherLocality.slug })).toEqual([lehenga]);
    expect(await ids({ minPrice: "5000" })).toEqual([lehenga]);
    expect(await ids({ minPrice: "3000", maxPrice: "4000" })).toEqual([sherwani]);
    expect(await ids({ minPrice: "4000", maxPrice: "8000" })).toEqual([]);
    expect(await ids({ q: "bridal" })).toEqual([lehenga]);
    expect(await ids({ q: "sherwani", category: otherCategory.slug })).toEqual([]);
  });

  it("pages through results", async () => {
    const { owner, admin, form } = await listingSetup();
    for (let i = 0; i < 26; i++) {
      await publishListing(app, { ...form, title: `Sherwani number ${i + 1} in ivory` }, owner, admin);
    }
    const first = await app.search.explore({}).result;
    const second = await app.search.explore({ page: "2" }).result;
    expect([first.total, first.pageCount, first.items.length, second.items.length]).toEqual([26, 2, 24, 2]);
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(26);
  });

  it("shows the lender on each card: a new lender, then completed rentals and published reviews", async () => {
    const booking = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const card = async () => (await app.search.explore({}).result).items.find((c) => c.id === outfit.id)!;
    expect(await card()).toMatchObject({ ownerRating: null, ownerRatingCount: 0, ownerCompletedRentals: 0 });

    // One real rental, start to finish.
    const { bookingId } = await booking.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await booking.bookings.approve(owner, { bookingId });
    await booking.payThroughSandbox(renter, bookingId);
    booking.clock.set("2026-12-10T05:00:00Z");
    await booking.bookings.submitHandoverReport(
      owner,
      { bookingId, grade: "GOOD", notes: "Fine." },
      photos(3),
    );
    await booking.bookings.acknowledgeHandover(renter, { bookingId });
    booking.clock.set("2026-12-12T12:00:00Z");
    await booking.bookings.recordReturn(owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
    await booking.bookings.confirmReturn(owner, { bookingId });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("COMPLETED");

    // Published review aggregates (kept by the reviews module) show as a rating.
    await db.userProfile.update({
      where: { userId: owner.userId },
      data: { ownerRatingSum: 14, ownerRatingCount: 3 },
    });
    expect(await card()).toMatchObject({ ownerRating: 4.7, ownerRatingCount: 3, ownerCompletedRentals: 1 });
  });
});

describe("renting from other people", () => {
  it("lets a member rent someone else's outfit, never their own, and only while it is published", async () => {
    const booking = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const request = (actor: typeof renter, startDate: string) =>
      booking.bookings.request(actor, { outfitId: outfit.id, startDate, days: 3, acceptTerms: "on" });

    // The same account type rents and lends: the owner here is just another member.
    await expect(request(owner, "2026-12-10")).rejects.toMatchObject({ code: "OWN_OUTFIT" });
    const { bookingId } = await request(renter, "2026-12-10");
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      "PENDING_APPROVAL",
    );

    // A paused outfit cannot be requested, and its existing request is untouched.
    await db.outfit.update({ where: { id: outfit.id }, data: { status: "PAUSED" } });
    await expect(request(renter, "2027-01-10")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      "PENDING_APPROVAL",
    );
  });
});

describe("the free-dates marker", () => {
  it("is only promised when the results were really filtered by the date", () => {
    // The test clock is 1 December 2026 (IST).
    expect(app.search.explore({ from: "2026-12-20" }).datesChecked).toBe(true);
    expect(app.search.explore({ from: "2026-12-01" }).datesChecked).toBe(false); // today: not filtered
    expect(app.search.explore({ from: "2026-11-20" }).datesChecked).toBe(false);
    expect(app.search.explore({}).datesChecked).toBe(false);
  });
});
