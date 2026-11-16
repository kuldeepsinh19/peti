/**
 * Phase 3 owner experience: photographs and cover, preview access, My Outfits, and what listing changes do
 * (and do not do) to existing bookings.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../support/app";
import { db, resetDatabase } from "../support/db";
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
