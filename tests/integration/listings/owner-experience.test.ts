/**
 * Phase 3 owner experience: photographs and cover, preview access, My Outfits, and what listing changes do
 * (and do not do) to existing bookings.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { listingsUseCases } from "@/modules/listings";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { buildApp, clock, memoryPhotos } from "../support/app";
import { db, insertBookingRow, resetDatabase } from "../support/db";
import { listingSetup, publishListing } from "../support/listing-fixtures";

const app = buildApp();

beforeEach(async () => {
  await resetDatabase();
});

const photoOrder = async (outfitId: string) =>
  (await db.outfitImage.findMany({ where: { outfitId }, orderBy: { sortOrder: "asc" } })).map((p) => p.id);

describe("photographs and the cover", () => {
  it("takes several photographs and lets the owner choose the cover", async () => {
    const { owner, form } = await listingSetup();
    const { id } = await app.listings.createListing(owner, form);
    const [a, b, c] = [
      await app.listings.addPhoto(owner, id, new Uint8Array([1]), "Front"),
      await app.listings.addPhoto(owner, id, new Uint8Array([1]), "Back"),
      await app.listings.addPhoto(owner, id, new Uint8Array([1]), "Detail"),
    ];
    expect(await photoOrder(id)).toEqual([a.id, b.id, c.id]);

    await app.listings.setCoverPhoto(owner, { outfitId: id, photoId: c.id });
    expect(await photoOrder(id)).toEqual([c.id, a.id, b.id]);
    const view = await app.listings.getForEdit(owner, id);
    expect(view.photos[0]?.id).toBe(c.id);
  });

  it("only lets the owner choose the cover, and only among the listing's own photographs", async () => {
    const { owner, stranger, form } = await listingSetup();
    const { id } = await app.listings.createListing(owner, form);
    const other = await app.listings.createListing(owner, { ...form, title: "Another outfit to rent" });
    const photo = await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    const foreign = await app.listings.addPhoto(owner, other.id, new Uint8Array([1]), "");

    await expect(
      app.listings.setCoverPhoto(stranger, { outfitId: id, photoId: photo.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      app.listings.setCoverPhoto(owner, { outfitId: id, photoId: foreign.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.listings.setCoverPhoto(owner, { outfitId: id, photoId: "x" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("keeps a live listing live when only the cover changes", async () => {
    const { owner, admin, form } = await listingSetup();
    const id = await publishListing(app, form, owner, admin);
    const second = await app.listings.addPhoto(owner, id, new Uint8Array([1]), "Side");
    // A new photograph is new content: back to review, then approved again.
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_REVIEW");
    await app.listings.approve(admin, { outfitId: id });

    await app.listings.setCoverPhoto(owner, { outfitId: id, photoId: second.id });
    expect((await db.outfit.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    expect((await photoOrder(id))[0]).toBe(second.id);
  });
});

describe("the essentials-first listing form", () => {
  it("creates a draft from the essentials alone: condition defaults to good, notes may be left out", async () => {
    const { owner, form } = await listingSetup();
    const { conditionGrade: _grade, conditionNotes: _notes, ...essentials } = form;
    const { id } = await app.listings.createListing(owner, essentials);
    expect(await db.outfit.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
      conditionGrade: "GOOD",
      conditionNotes: "",
    });
  });

  it("still refuses missing essentials, bad prices and notes that say nothing", async () => {
    const { owner, form } = await listingSetup();
    const fieldsFor = (input: Record<string, unknown>) =>
      app.listings.createListing(owner, input).then(
        () => [],
        (e: { code: string; fieldErrors?: Record<string, string[]> }) => {
          expect(e.code).toBe("VALIDATION_FAILED");
          return Object.keys(e.fieldErrors ?? {});
        },
      );
    const { title: _t, categoryId: _c, ...noTitle } = form;
    expect(await fieldsFor(noTitle)).toEqual(expect.arrayContaining(["title", "categoryId"]));
    expect(await fieldsFor({ ...form, conditionNotes: "ok" })).toEqual(["conditionNotes"]);
    expect(await fieldsFor({ ...form, price3: "-5", price5: "abc" })).toEqual(
      expect.arrayContaining(["price3", "price5"]),
    );
    expect(await fieldsFor({ ...form, price3: "50000" })).toContain("price3"); // above what it cost new
    expect(await db.outfit.count()).toBe(0);
  });
});

describe("My outfits", () => {
  it("shows each outfit with its requests waiting, upcoming rentals and next rental date", async () => {
    const { owner, admin, stranger, form } = await listingSetup();
    const live = await publishListing(app, form, owner, admin);
    const draft = (await app.listings.createListing(owner, { ...form, title: "Draft lehenga to finish" })).id;
    const booking = (startDate: string, endDate: string) =>
      insertBookingRow({
        outfitId: live,
        ownerId: owner.userId,
        renterId: stranger.userId,
        startDate,
        endDate,
      });
    await booking("2027-01-10", "2027-01-12"); // waiting for the owner
    await booking("2027-02-01", "2027-02-03");
    const confirmed = await booking("2027-03-05", "2027-03-07");
    await db.booking.update({ where: { id: confirmed.id }, data: { status: "AWAITING_PAYMENT" } });

    const rows = await app.listings.listMine(owner);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[live]).toMatchObject({
      status: "ACTIVE",
      pendingRequests: 2,
      upcomingRentals: 1,
      nextRentalStart: "2027-03-05",
      openBookings: 3,
      photoCount: 1,
      minPricePaise: 350_000,
      minPriceDays: 3,
    });
    expect(byId[draft]).toMatchObject({
      status: "DRAFT",
      pendingRequests: 0,
      upcomingRentals: 0,
      nextRentalStart: null,
      photoCount: 0,
    });
    // Only the owner's own outfits.
    expect(await app.listings.listMine(stranger)).toEqual([]);
  });

  it("pausing and editing a booked outfit leave its bookings exactly as they were", async () => {
    const { owner, admin, stranger, form } = await listingSetup();
    const id = await publishListing(app, form, owner, admin);
    const before = await insertBookingRow({ outfitId: id, ownerId: owner.userId, renterId: stranger.userId });

    await app.listings.pause(owner, { outfitId: id });
    await app.listings.updateListing(owner, id, { ...form, title: "Ivory sherwani, freshly cleaned" });
    await app.listings.resume(owner, { outfitId: id }).catch(() => undefined); // back in review after the edit

    const after = await db.booking.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
    await expect(app.listings.archive(owner, { outfitId: id })).rejects.toMatchObject({
      code: "LISTING_HAS_BOOKINGS",
    });
  });
});

describe("photographs in the public demo", () => {
  it("are refused before anything is stored, with a message that says why", async () => {
    const demo = listingsUseCases({
      listings: prismaListingRepository(db),
      photos: memoryPhotos,
      audit: prismaAuditLog(db),
      clock,
      photoUploadsEnabled: false,
    });
    const { owner, stranger, form } = await listingSetup();
    const { id } = await demo.createListing(owner, form);
    const saved = memoryPhotos.saved.length;
    await expect(demo.addPhoto(owner, id, new Uint8Array([1]), "")).rejects.toMatchObject({
      code: "PHOTO_UPLOADS_DISABLED",
      message: expect.stringContaining("public demo"),
    });
    expect(memoryPhotos.saved.length).toBe(saved);
    expect(await db.outfitImage.count({ where: { outfitId: id } })).toBe(0);
    // Ownership is still checked first: a stranger learns nothing about the listing.
    await expect(demo.addPhoto(stranger, id, new Uint8Array([1]), "")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
