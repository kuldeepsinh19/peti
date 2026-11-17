import type { buildApp } from "./app";
import { actorFor } from "./app";
import { createCategory, createLocality, createUser, db } from "./db";

type App = ReturnType<typeof buildApp>;

/** An owner with a pickup address, an admin, a stranger, and a valid listing form for them. */
export async function listingSetup() {
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
  const form: Record<string, unknown> = {
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
  };
  return {
    owner: actorFor(owner),
    admin: actorFor(admin),
    stranger: actorFor(stranger),
    ownerUser: owner,
    form,
    category,
    locality,
  };
}

/** Creates, photographs, submits and approves a listing: a live outfit. */
export async function publishListing(
  app: App,
  form: Record<string, unknown>,
  owner: ReturnType<typeof actorFor>,
  admin: ReturnType<typeof actorFor>,
) {
  const { id } = await app.listings.createListing(owner, form);
  for (let i = 0; i < 3; i++) await app.listings.addPhoto(owner, id, new Uint8Array([1]), "");
  await app.listings.submitForReview(owner, { outfitId: id });
  await app.listings.approve(admin, { outfitId: id });
  return id;
}
