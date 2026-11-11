import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, PreconditionError, ValidationError } from "@/shared/domain/errors";
import { actorFor, buildApp } from "../support/app";
import { createCategory, createLocality, createUser, db, resetDatabase } from "../support/db";

const app = buildApp();

async function setup() {
  const [owner, admin, stranger, locality, category] = await Promise.all([
    createUser({ name: "Owner One" }),
    createUser({ name: "Admin", role: "admin" }),
    createUser({ name: "Someone Else" }),
    createLocality(),
    createCategory(),
  ]);
  const address = await db.address.create({
    data: {
      userId: owner.id,
      line1: "12 Test Society",
      localityId: locality.id,
      pincode: "380015",
      isDefault: true,
    },
  });
  const form = {
    title: "Ivory sherwani with thread-work",
    description: "Worn once at my cousin's wedding. Comes with churidar and a matching stole.",
    categoryId: category.id,
    sizeLabel: "M",
    conditionGrade: "EXCELLENT",
    conditionNotes: "No known flaws.",
    retailValueRupees: "30000",
    depositRupees: "6000",
    turnaroundDays: "1",
    occasions: ["WEDDING", "RECEPTION"],
    localityId: locality.id,
    pickupAddressId: address.id,
    price3: "3500",
    price5: "4800",
    chest: "102.5",
  };
  return {
    owner: actorFor(owner),
    admin: actorFor(admin),
    stranger: actorFor(stranger),
    form,
    category,
    locality,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("listing lifecycle", () => {
  it("creates a draft, requires photos before review, and publishes only after admin approval", async () => {
    const { owner, admin, form } = await setup();
    const { id } = await app.listings.createListing(owner, form);

    const draft = await db.outfit.findUniqueOrThrow({
      where: { id },
      include: { measurements: true, priceOptions: true },
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.minPricePaise).toBe(350_000);
    expect(draft.measurements?.chestMm).toBe(1025);
    expect(draft.priceOptions.map((p) => p.durationDays).sort()).toEqual([3, 5]);

    await expect(app.listings.submitForReview(owner, { outfitId: id })).rejects.toMatchObject({
      code: "LISTING_NEEDS_PHOTOS",
    });
    await app.listings.addPhoto(owner, id, new Uint8Array([1]), "Front view");
    await app.listings.submitForReview(owner, { outfitId: id });

    // Owners cannot approve their own listing; only administrators can.
    await expect(app.listings.approve(owner, { outfitId: id })).rejects.toBeInstanceOf(ForbiddenError);
    await app.listings.approve(admin, { outfitId: id });
    const live = await db.outfit.findUniqueOrThrow({ where: { id } });
    expect(live.status).toBe("ACTIVE");
    expect(live.publishedAt).not.toBeNull();

    const audit = await db.auditLog.findMany({ where: { entityId: id } });
    expect(audit.map((a) => a.action)).toEqual(["listing.approve"]);
  });

  it("requires verified contact details to submit for review", async () => {
    const { owner, form } = await setup();
    const { id } = await app.listings.createListing(owner, form);
    await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await expect(
      app.listings.submitForReview({ ...owner, phoneVerified: false }, { outfitId: id }),
    ).rejects.toMatchObject({ code: "PHONE_NOT_VERIFIED" });
  });

  it("rejects invalid money with field errors", async () => {
    const { owner, form } = await setup();
    const attempt = app.listings.createListing(owner, { ...form, depositRupees: "40000", price5: "3000" });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await attempt.catch((error: ValidationError) => {
      expect(Object.keys(error.fieldErrors).sort()).toEqual(["depositRupees", "price5"]);
    });
  });

  it("refuses another user's pickup address and never lets a stranger edit", async () => {
    const { owner, stranger, form } = await setup();
    const strangerAddress = await db.address.create({
      data: { userId: stranger.userId, line1: "Elsewhere", localityId: form.localityId, pincode: "380001" },
    });
    await expect(
      app.listings.createListing(owner, { ...form, pickupAddressId: strangerAddress.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    const { id } = await app.listings.createListing(owner, form);
    await expect(app.listings.updateListing(stranger, id, form)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(app.listings.pause(stranger, { outfitId: id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("sends a live listing back for review when its content changes, but not for a price change", async () => {
    const { owner, admin, form } = await setup();
    const { id } = await app.listings.createListing(owner, form);
    await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });
    await app.listings.approve(admin, { outfitId: id });

    expect(await app.listings.updateListing(owner, id, { ...form, price3: "3600" })).toMatchObject({
      status: "ACTIVE",
      sentForReview: false,
    });
    expect(
      await app.listings.updateListing(owner, id, { ...form, title: "Ivory sherwani, newly altered" }),
    ).toMatchObject({
      status: "PENDING_REVIEW",
      sentForReview: true,
    });
  });

  it("requires a reason to reject or suspend, and enforces legal moderation transitions", async () => {
    const { owner, admin, form } = await setup();
    const { id } = await app.listings.createListing(owner, form);
    await expect(app.listings.approve(admin, { outfitId: id })).rejects.toBeInstanceOf(PreconditionError);
    await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });
    await expect(app.listings.reject(admin, { outfitId: id })).rejects.toBeInstanceOf(ValidationError);
    await app.listings.reject(admin, { outfitId: id, note: "Please photograph the full length." });
    const rejected = await db.outfit.findUniqueOrThrow({ where: { id } });
    expect(rejected).toMatchObject({
      status: "REJECTED",
      moderationNote: "Please photograph the full length.",
    });
  });
});

describe("discovery", () => {
  async function publish(
    form: Record<string, unknown>,
    owner: ReturnType<typeof actorFor>,
    admin: ReturnType<typeof actorFor>,
  ) {
    const { id } = await app.listings.createListing(owner, form);
    await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
    await app.listings.submitForReview(owner, { outfitId: id });
    await app.listings.approve(admin, { outfitId: id });
    return id;
  }

  it("shows only live listings and filters by keyword (with misspellings), size, price and dates", async () => {
    const { owner, admin, form } = await setup();
    const sherwani = await publish(form, owner, admin);
    const lehenga = await publish(
      {
        ...form,
        title: "Dusty rose bridal lehenga",
        sizeLabel: "S",
        price3: "9000",
        price5: "12000",
        retailValueRupees: "70000",
      },
      owner,
      admin,
    );
    await app.listings.createListing(owner, { ...form, title: "Unpublished draft sherwani" });

    const all = await app.search.explore({}).result;
    expect(all.items.map((i) => i.id).sort()).toEqual([sherwani, lehenga].sort());

    expect((await app.search.explore({ q: "lehenga" }).result).items.map((i) => i.id)).toEqual([lehenga]);
    expect((await app.search.explore({ q: "lehnga" }).result).items.map((i) => i.id)).toEqual([lehenga]);
    expect((await app.search.explore({ size: "S" }).result).items.map((i) => i.id)).toEqual([lehenga]);
    expect((await app.search.explore({ maxPrice: "5000" }).result).items.map((i) => i.id)).toEqual([
      sherwani,
    ]);
    expect((await app.search.explore({ chestMin: "100", chestMax: "105" }).result).total).toBe(2);

    // Block the sherwani's calendar: a search for those dates must not show it.
    await db.calendarHold.create({
      data: {
        outfitId: sherwani,
        kind: "OWNER_BLOCK",
        startsOn: new Date("2026-12-20T00:00:00Z"),
        endsBefore: new Date("2026-12-25T00:00:00Z"),
        createdById: owner.userId,
      },
    });
    const onDates = await app.search.explore({ from: "2026-12-21", days: "3" }).result;
    expect(onDates.items.map((i) => i.id)).toEqual([lehenga]);
    // The day after the block ends, minus the one-day buffer, is free again.
    const later = await app.search.explore({ from: "2026-12-25", days: "3" }).result;
    expect(later.total).toBe(2);

    // Malformed parameters are ignored rather than failing.
    expect(
      (await app.search.explore({ minPrice: "abc", from: "2026-02-31", size: "HUGE" }).result).total,
    ).toBe(2);
  });

  it("hides non-live listings from the public detail page but shows them to their owner", async () => {
    const { owner, stranger, form } = await setup();
    const { slug } = await app.listings.createListing(owner, form);
    await expect(app.search.outfit(stranger, slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.search.outfit(null, slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.search.outfit(owner, slug)).resolves.toMatchObject({ status: "DRAFT" });
  });
});
