import { marketplacePolicy } from "@/config/marketplace-policy";
import type { Actor } from "@/shared/application/actor";
import { requireAdmin, requireUser, requireVerifiedContact } from "@/shared/application/authorization";
import {
  ConcurrencyError,
  ForbiddenError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/shared/domain/errors";
import { parseInput } from "@/shared/contracts/validation";
import { cmToMm, listingSlug, validateListingMoney } from "../domain/listing-rules";
import { editNeedsReview, isEditable, nextOutfitStatus, type OutfitCommand } from "../domain/outfit-status";
import {
  type ListingFormData,
  listingFormSchema,
  MEASUREMENT_FIELDS,
  moderationSchema,
  outfitIdSchema,
  photoIdSchema,
} from "./contracts";
import type { ListingData, ListingsDeps, OwnedOutfit } from "./ports";

function toListingData(form: ListingFormData): ListingData {
  const prices = marketplacePolicy.durationOptionsDays
    .map((days) => ({ durationDays: days, rupees: form[`price${days}` as const] }))
    .filter(
      (p): p is { durationDays: (typeof marketplacePolicy.durationOptionsDays)[number]; rupees: number } =>
        typeof p.rupees === "number",
    )
    .map((p) => ({ durationDays: p.durationDays, pricePaise: p.rupees * 100 }));
  const measurementsMm = Object.fromEntries(
    MEASUREMENT_FIELDS.map((f) => [f, cmToMm(form[f])]),
  ) as ListingData["measurementsMm"];
  return {
    title: form.title,
    description: form.description,
    categoryId: form.categoryId,
    brand: form.brand ?? null,
    colour: form.colour ?? null,
    fabric: form.fabric ?? null,
    sizeLabel: form.sizeLabel,
    conditionGrade: form.conditionGrade,
    conditionNotes: form.conditionNotes,
    retailValuePaise: form.retailValueRupees * 100,
    depositPaise: form.depositRupees * 100,
    turnaroundDays: form.turnaroundDays,
    occasions: [...new Set(form.occasions)],
    localityId: form.localityId,
    pickupAddressId: form.pickupAddressId,
    prices,
    measurementsMm,
    measurementNotes: form.measurementNotes ?? null,
  };
}

export function listingsUseCases(deps: ListingsDeps) {
  const { listings, photos, audit, clock } = deps;

  async function setStatusOrConflict(...args: Parameters<typeof listings.setStatus>) {
    if (!(await listings.setStatus(...args))) throw new ConcurrencyError();
  }

  async function validated(ownerId: string, input: unknown): Promise<ListingData> {
    const data = toListingData(parseInput(listingFormSchema, input));
    const fieldErrors: Record<string, string[]> = Object.fromEntries(
      Object.entries(validateListingMoney(data)).map(([k, v]) => [k, [v]]),
    );
    if (!(await listings.addressBelongsTo(data.pickupAddressId, ownerId))) {
      fieldErrors.pickupAddressId = ["Choose one of your saved addresses."];
    }
    if (!(await listings.categoryAndLocalityExist(data.categoryId, data.localityId))) {
      fieldErrors.categoryId = ["Choose a category and locality from the lists."];
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError("Please check the highlighted fields.", fieldErrors);
    }
    return data;
  }

  /** Loads an outfit and checks the actor owns it (admins are not owners: they use moderation). */
  async function owned(actor: Actor, outfitId: string): Promise<OwnedOutfit> {
    const user = requireUser(actor);
    const outfit = await listings.findOwned(outfitId);
    if (!outfit) throw new NotFoundError("Listing");
    if (outfit.ownerId !== user.userId) throw new ForbiddenError("Only the owner can change this listing.");
    return outfit;
  }

  async function ownerTransition(actor: Actor, input: unknown, command: OutfitCommand) {
    const { outfitId } = parseInput(outfitIdSchema, input);
    const outfit = await owned(actor, outfitId);
    const next = nextOutfitStatus(outfit.status, command, "owner");
    if (command === "submit") {
      requireVerifiedContact(actor);
      if (outfit.photoCount === 0) {
        throw new PreconditionError("LISTING_NEEDS_PHOTOS", "Add at least one photograph before submitting.");
      }
    }
    if (command === "archive" && (await listings.countOpenBookings(outfitId)) > 0) {
      throw new PreconditionError(
        "LISTING_HAS_BOOKINGS",
        "This outfit has bookings in progress. Pause it instead, and archive it once they are complete.",
      );
    }
    await setStatusOrConflict(
      outfitId,
      outfit.status,
      next,
      command === "submit" ? { submittedAt: clock.now(), moderationNote: null } : {},
    );
    return next;
  }

  async function adminTransition(actor: Actor, input: unknown, command: OutfitCommand) {
    const admin = requireAdmin(actor);
    const { outfitId, note } = parseInput(moderationSchema, input);
    const outfit = await listings.findOwned(outfitId);
    if (!outfit) throw new NotFoundError("Listing");
    if ((command === "reject" || command === "suspend") && !note) {
      throw new ValidationError("Please give a reason.", {
        note: ["A reason is required — the owner will see it."],
      });
    }
    const next = nextOutfitStatus(outfit.status, command, "admin");
    await setStatusOrConflict(outfitId, outfit.status, next, {
      moderationNote: note ?? null,
      ...(command === "approve" ? { publishedAt: clock.now() } : {}),
    });
    await audit.record({
      actorUserId: admin.userId,
      actorRole: "ADMIN",
      action: `listing.${command}`,
      entityType: "outfit",
      entityId: outfitId,
      before: { status: outfit.status },
      after: { status: next },
      ...(note ? { reason: note } : {}),
    });
    return next;
  }

  return {
    async createListing(actor: Actor, input: unknown) {
      const user = requireUser(actor);
      const data = await validated(user.userId, input);
      return listings.create(user.userId, listingSlug(data.title), data);
    },

    /** Saves edits. Changes to what renters see on a live listing send it back for review. */
    async updateListing(actor: Actor, outfitId: string, input: unknown) {
      const outfit = await owned(actor, outfitId);
      if (!isEditable(outfit.status)) {
        throw new PreconditionError("LISTING_FROZEN", "Suspended or archived listings cannot be edited.");
      }
      const data = await validated(outfit.ownerId, input);
      const contentChanged =
        data.title !== outfit.title ||
        data.description !== outfit.description ||
        data.categoryId !== outfit.categoryId;
      const status = editNeedsReview(outfit.status, contentChanged)
        ? nextOutfitStatus(outfit.status, "contentEdited", "system")
        : outfit.status;
      await listings.update(outfitId, data, status);
      return { status, sentForReview: status !== outfit.status };
    },

    async addPhoto(actor: Actor, outfitId: string, bytes: Uint8Array, altText: string) {
      const outfit = await owned(actor, outfitId);
      if (!isEditable(outfit.status))
        throw new PreconditionError("LISTING_FROZEN", "This listing cannot be edited.");
      if (outfit.photoCount >= marketplacePolicy.maxListingPhotos) {
        throw new PreconditionError(
          "TOO_MANY_PHOTOS",
          `A listing can have up to ${marketplacePolicy.maxListingPhotos} photographs.`,
        );
      }
      const stored = await photos.save(outfitId, bytes);
      const photo = await listings.addPhoto(outfitId, {
        storageKey: stored.storageKey,
        width: stored.width,
        height: stored.height,
        altText: altText.trim().slice(0, 200) || outfit.title,
      });
      // A new photograph on a live listing is new content renters will see.
      if (editNeedsReview(outfit.status, true)) {
        await setStatusOrConflict(
          outfitId,
          outfit.status,
          nextOutfitStatus(outfit.status, "contentEdited", "system"),
        );
      }
      return photo;
    },

    async removePhoto(actor: Actor, input: unknown) {
      const { outfitId, photoId } = parseInput(photoIdSchema, input);
      const outfit = await owned(actor, outfitId);
      if (!isEditable(outfit.status))
        throw new PreconditionError("LISTING_FROZEN", "This listing cannot be edited.");
      if ((outfit.status === "ACTIVE" || outfit.status === "PAUSED") && outfit.photoCount <= 1) {
        throw new PreconditionError(
          "LISTING_NEEDS_PHOTOS",
          "A published listing needs at least one photograph.",
        );
      }
      const removed = await listings.removePhoto(outfitId, photoId);
      if (!removed) throw new NotFoundError("Photograph");
      await photos.remove(removed.storageKey);
    },

    submitForReview: (actor: Actor, input: unknown) => ownerTransition(actor, input, "submit"),
    withdrawFromReview: (actor: Actor, input: unknown) => ownerTransition(actor, input, "withdraw"),
    pause: (actor: Actor, input: unknown) => ownerTransition(actor, input, "pause"),
    resume: (actor: Actor, input: unknown) => ownerTransition(actor, input, "resume"),
    archive: (actor: Actor, input: unknown) => ownerTransition(actor, input, "archive"),

    approve: (actor: Actor, input: unknown) => adminTransition(actor, input, "approve"),
    reject: (actor: Actor, input: unknown) => adminTransition(actor, input, "reject"),
    suspend: (actor: Actor, input: unknown) => adminTransition(actor, input, "suspend"),
    reinstate: (actor: Actor, input: unknown) => adminTransition(actor, input, "reinstate"),

    async getForEdit(actor: Actor, outfitId: string) {
      await owned(actor, outfitId);
      const view = await listings.getForEdit(outfitId);
      if (!view) throw new NotFoundError("Listing");
      return view;
    },

    listMine: (actor: Actor) => listings.listForOwner(requireUser(actor).userId),

    listForModeration(actor: Actor, statuses: Parameters<typeof listings.listForModeration>[0]) {
      requireAdmin(actor);
      return listings.listForModeration(statuses);
    },
  };
}

export type ListingsUseCases = ReturnType<typeof listingsUseCases>;
