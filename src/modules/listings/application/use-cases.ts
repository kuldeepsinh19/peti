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
import { cmToMm, listingSlug, orderWithCover, validateListingMoney } from "../domain/listing-rules";
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
import { isUuid } from "@/shared/domain/ids";

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

/** What the owner is told after an administrator's decision. */
const DECISION_MESSAGES: Partial<
  Record<OutfitCommand, { subject: (title: string) => string; body: (note?: string) => string }>
> = {
  approve: {
    subject: (title) => `${title} is published`,
    body: () => "Renters can now find and request it. You will hear from Peti when someone does.",
  },
  reject: {
    subject: (title) => `Changes requested for ${title}`,
    body: (note) =>
      `A Peti administrator asked for changes before it goes live: ${note ?? "see the listing"}. Edit it and submit it again.`,
  },
  reinstate: {
    subject: (title) => `${title} is no longer suspended`,
    body: () =>
      "A Peti administrator lifted the suspension. The listing is paused: resume it from My outfits when you want renters to find it.",
  },
  suspend: {
    subject: (title) => `${title} is suspended`,
    body: (note) =>
      `A Peti administrator suspended it, so renters cannot see it: ${note ?? "no reason given"}.`,
  },
};

const NEEDS_PHOTOS_MESSAGE = `Add at least ${marketplacePolicy.minListingPhotos} photographs before submitting: front, back and a close-up of the work.`;

export const PHOTO_UPLOADS_DISABLED_MESSAGE =
  "Photo upload isn't available in the public demo. Listings there use the photographs already added.";

export function listingsUseCases(deps: ListingsDeps) {
  const { listings, photos, audit, clock } = deps;

  async function setStatusOrConflict(...args: Parameters<typeof listings.setStatus>) {
    if (!(await listings.setStatus(...args))) throw new ConcurrencyError();
  }

  async function validated(
    ownerId: string,
    input: unknown,
    currentCategoryId?: string,
  ): Promise<ListingData> {
    const data = toListingData(parseInput(listingFormSchema, input));
    const fieldErrors: Record<string, string[]> = Object.fromEntries(
      Object.entries(validateListingMoney(data)).map(([k, v]) => [k, [v]]),
    );
    if (!(await listings.addressBelongsTo(data.pickupAddressId, ownerId))) {
      fieldErrors.pickupAddressId = ["Choose one of your saved addresses."];
    }
    if (!(await listings.categoryAndLocalityExist(data.categoryId, data.localityId, currentCategoryId))) {
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
    const outfit = isUuid(outfitId) ? await listings.findOwned(outfitId) : null;
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
      if (outfit.photoCount < marketplacePolicy.minListingPhotos) {
        throw new PreconditionError("LISTING_NEEDS_PHOTOS", NEEDS_PHOTOS_MESSAGE);
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
    if (outfit.ownerId === admin.userId) {
      throw new ForbiddenError("This listing is yours, so another administrator must review it.");
    }
    if ((command === "reject" || command === "suspend") && !note) {
      throw new ValidationError("Please give a reason.", {
        note: ["A reason is required — the owner will see it."],
      });
    }
    const next = nextOutfitStatus(outfit.status, command, "admin");
    if (command === "approve" && outfit.photoCount < marketplacePolicy.minListingPhotos) {
      throw new PreconditionError(
        "LISTING_NEEDS_PHOTOS",
        `A listing needs at least ${marketplacePolicy.minListingPhotos} photographs before it is published.`,
      );
    }
    // An edit to a paused listing is approved back to PAUSED: approval never overrides the owner's pause.
    const approvedTo = command === "approve" && outfit.resumePausedAfterReview ? "PAUSED" : next;
    await setStatusOrConflict(outfitId, outfit.status, approvedTo, {
      moderationNote: note ?? null,
      ...(command === "approve" ? { publishedAt: clock.now(), resumePausedAfterReview: false } : {}),
    });
    await audit.record({
      actorUserId: admin.userId,
      actorRole: "ADMIN",
      action: `listing.${command}`,
      entityType: "outfit",
      entityId: outfitId,
      before: { status: outfit.status },
      after: { status: approvedTo },
      ...(note ? { reason: note } : {}),
    });
    const message = DECISION_MESSAGES[command];
    if (message && deps.notifications) {
      await deps.notifications.enqueue([
        {
          userId: outfit.ownerId,
          type: `listing.${command}`,
          ...(approvedTo === "PAUSED"
            ? {
                subject: `Changes approved for ${outfit.title}`,
                body: "Your changes are approved. The listing is still paused: resume it from My outfits when you want renters to find it.",
              }
            : { subject: message.subject(outfit.title), body: message.body(note) }),
          link: command === "approve" ? `/outfits/${outfit.slug}` : `/lend/outfits/${outfitId}/edit`,
          // One message per decision, even if the action is retried.
          dedupeKey: `listing:${outfitId}:${command}:${clock.now().getTime()}`,
          channels: ["IN_APP", "EMAIL"],
        },
      ]);
    }
    return approvedTo;
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
      const data = await validated(outfit.ownerId, input, outfit.categoryId);
      const contentChanged =
        data.title !== outfit.title ||
        data.description !== outfit.description ||
        data.categoryId !== outfit.categoryId;
      const status = editNeedsReview(outfit.status, contentChanged)
        ? nextOutfitStatus(outfit.status, "contentEdited", "system")
        : outfit.status;
      // Compare-and-swap on the status we read: an edit must never undo a suspension (or any other status
      // change) that happened while the owner was saving.
      if (!(await listings.update(outfitId, data, outfit.status, status))) throw new ConcurrencyError();
      return { status, sentForReview: status !== outfit.status };
    },

    async addPhoto(actor: Actor, outfitId: string, bytes: Uint8Array, altText: string) {
      const outfit = await owned(actor, outfitId);
      if (deps.photoUploadsEnabled === false) {
        throw new PreconditionError("PHOTO_UPLOADS_DISABLED", PHOTO_UPLOADS_DISABLED_MESSAGE);
      }
      if (!isEditable(outfit.status))
        throw new PreconditionError("LISTING_FROZEN", "This listing cannot be edited.");
      if (outfit.photoCount >= marketplacePolicy.maxListingPhotos) {
        throw new PreconditionError(
          "TOO_MANY_PHOTOS",
          `A listing can have up to ${marketplacePolicy.maxListingPhotos} photographs.`,
        );
      }
      const stored = await photos.save(outfitId, bytes);
      const photo = await listings.addPhoto(
        outfitId,
        {
          storageKey: stored.storageKey,
          width: stored.width,
          height: stored.height,
          altText: altText.trim().slice(0, 200) || outfit.title,
        },
        marketplacePolicy.maxListingPhotos,
      );
      if (photo === "FULL") {
        // Another upload filled the last place while this one was being processed.
        await photos.remove(stored.storageKey);
        throw new PreconditionError(
          "TOO_MANY_PHOTOS",
          `A listing can have up to ${marketplacePolicy.maxListingPhotos} photographs.`,
        );
      }
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
      // A listing that is published, paused or waiting for review keeps the minimum number of photographs
      // (otherwise it could be approved, or stay public, with fewer). Drafts may go below it.
      const keepsMinimum =
        outfit.status === "ACTIVE" || outfit.status === "PAUSED" || outfit.status === "PENDING_REVIEW";
      const removed = await listings.removePhoto(
        outfitId,
        photoId,
        keepsMinimum ? marketplacePolicy.minListingPhotos : 0,
      );
      if (removed === "TOO_FEW") {
        throw new PreconditionError(
          "LISTING_NEEDS_PHOTOS",
          `A listing that is published or in review keeps at least ${marketplacePolicy.minListingPhotos} photographs. Add another before removing this one.`,
        );
      }
      if (!removed) throw new NotFoundError("Photograph");
      await photos.remove(removed.storageKey);
    },

    /**
     * Makes a photograph the cover (the one renters see first in Explore). It only reorders photographs a
     * reviewer has already seen, so a live listing stays live.
     */
    async setCoverPhoto(actor: Actor, input: unknown) {
      const { outfitId, photoId } = parseInput(photoIdSchema, input);
      const outfit = await owned(actor, outfitId);
      if (!isEditable(outfit.status))
        throw new PreconditionError("LISTING_FROZEN", "This listing cannot be edited.");
      const current = await listings.listPhotos(outfitId);
      const order = orderWithCover(
        current.map((p) => p.id),
        photoId,
      );
      if (!order) throw new NotFoundError("Photograph");
      await listings.setPhotoOrder(outfitId, order);
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

    /**
     * Who may see a stored listing photograph (POC hardening #25). "public" when the listing is published;
     * "private" for its owner, an administrator, or a renter who booked it while it is not (or while its owner
     * is suspended); null otherwise
     * (and for a key that is not a listing photograph). The viewer is looked up only when needed.
     */
    async photoVisibility(
      storageKey: string,
      viewer: () => Promise<Actor | null>,
    ): Promise<"public" | "private" | null> {
      const photo = await listings.photoOwner(storageKey);
      if (!photo) return null;
      // Search hides the listings of a suspended member, so their photographs are not public either.
      if (photo.status === "ACTIVE" && !photo.ownerSuspended) return "public";
      const actor = await viewer();
      if (!actor || actor.kind !== "user") return null;
      if (actor.isAdmin || actor.userId === photo.ownerId) return "private";
      return (await listings.hasBookedOutfit(actor.userId, photo.outfitId)) ? "private" : null;
    },

    listForModeration(actor: Actor, statuses: Parameters<typeof listings.listForModeration>[0]) {
      requireAdmin(actor);
      return listings.listForModeration(statuses);
    },
  };
}

export type ListingsUseCases = ReturnType<typeof listingsUseCases>;
