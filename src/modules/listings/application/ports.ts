import type { AuditLog } from "@/shared/application/audit";
import type { OutfitStatus } from "../domain/outfit-status";
import type { MeasurementField } from "./contracts";

export interface ListingData {
  title: string;
  description: string;
  categoryId: string;
  brand: string | null;
  colour: string | null;
  fabric: string | null;
  sizeLabel: string;
  conditionGrade: string;
  conditionNotes: string;
  retailValuePaise: number;
  depositPaise: number;
  turnaroundDays: number;
  occasions: string[];
  localityId: string;
  pickupAddressId: string;
  prices: Array<{ durationDays: number; pricePaise: number }>;
  measurementsMm: Record<MeasurementField, number | null>;
  measurementNotes: string | null;
}

export interface OwnedOutfit {
  id: string;
  ownerId: string;
  slug: string;
  status: OutfitStatus;
  title: string;
  description: string;
  categoryId: string;
  photoCount: number;
  /** It was paused when an edit sent it to review: approval brings it back paused. */
  resumePausedAfterReview: boolean;
}

export interface ListingPhoto {
  id: string;
  storageKey: string;
  altText: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface ListingEditView extends ListingData {
  id: string;
  slug: string;
  status: OutfitStatus;
  moderationNote: string | null;
  photos: ListingPhoto[];
}

export interface OwnerListingRow {
  id: string;
  slug: string;
  title: string;
  status: OutfitStatus;
  categoryName: string;
  minPricePaise: number | null;
  /** The rental length the lowest price is for. */
  minPriceDays: number | null;
  photoKey: string | null;
  photoCount: number;
  moderationNote: string | null;
  /** Bookings in any open state (the listing cannot be archived while there are any). */
  openBookings: number;
  /** Requests waiting for the owner's answer. */
  pendingRequests: number;
  /** Approved bookings not yet returned: awaiting payment, confirmed or out with the renter. */
  upcomingRentals: number;
  /** First day of the earliest of those, as an ISO date. */
  nextRentalStart: string | null;
  updatedAt: Date;
}

export interface ModerationRow {
  id: string;
  slug: string;
  title: string;
  status: OutfitStatus;
  ownerName: string;
  categoryName: string;
  localityName: string;
  minPricePaise: number | null;
  retailValuePaise: number;
  depositPaise: number;
  photoKey: string | null;
  photoCount: number;
  submittedAt: Date | null;
  moderationNote: string | null;
}

/** Listing writes. Every method that takes an ownerId only touches that owner's outfits. */
export interface ListingRepository {
  create(ownerId: string, slug: string, data: ListingData): Promise<{ id: string; slug: string }>;
  /** Saves edits and the new status, only if the status is still `from`; false (nothing written) otherwise. */
  update(outfitId: string, data: ListingData, from: OutfitStatus, status: OutfitStatus): Promise<boolean>;
  findOwned(outfitId: string): Promise<OwnedOutfit | null>;
  getForEdit(outfitId: string): Promise<ListingEditView | null>;
  listForOwner(ownerId: string): Promise<OwnerListingRow[]>;
  /** Compare-and-swap: changes the status only if it is still `from`; false when someone else changed it. */
  setStatus(
    outfitId: string,
    from: OutfitStatus,
    status: OutfitStatus,
    extra?: {
      moderationNote?: string | null;
      publishedAt?: Date;
      submittedAt?: Date;
      resumePausedAfterReview?: boolean;
    },
  ): Promise<boolean>;
  /** Adds a photograph unless the listing already has `max` (checked under the outfit's row lock). */
  addPhoto(
    outfitId: string,
    photo: Omit<ListingPhoto, "id" | "sortOrder">,
    max: number,
  ): Promise<ListingPhoto | "FULL">;
  /**
   * Removes a photograph, unless that would leave fewer than `keepAtLeast` (checked under the outfit's row
   * lock, so two removals at once cannot both pass). Null when it is not the listing's photograph.
   */
  removePhoto(
    outfitId: string,
    photoId: string,
    keepAtLeast: number,
  ): Promise<ListingPhoto | null | "TOO_FEW">;
  /** The listing's photographs, cover first. */
  listPhotos(outfitId: string): Promise<ListingPhoto[]>;
  /** Rewrites the sort order to match `orderedIds` (all of the listing's photographs), in one transaction. */
  setPhotoOrder(outfitId: string, orderedIds: readonly string[]): Promise<void>;
  countOpenBookings(outfitId: string): Promise<number>;
  addressBelongsTo(addressId: string, userId: string): Promise<boolean>;
  /**
   * The category and locality exist and are active. `keepCategoryId`: a listing already in that category may
   * stay in it after an administrator hides the category.
   */
  categoryAndLocalityExist(categoryId: string, localityId: string, keepCategoryId?: string): Promise<boolean>;
  listForModeration(statuses: readonly OutfitStatus[]): Promise<ModerationRow[]>;
}

export interface PhotoStore {
  /** Validates, sanitises and stores an upload; returns the stored key and dimensions. */
  save(outfitId: string, bytes: Uint8Array): Promise<{ storageKey: string; width: number; height: number }>;
  remove(storageKey: string): Promise<void>;
}

export interface ListingsDeps {
  listings: ListingRepository;
  photos: PhotoStore;
  audit: AuditLog;
  clock: { now(): Date };
  /** False where photographs cannot be stored (the public demo); defaults to true. */
  photoUploadsEnabled?: boolean;
  /** Tells the owner what an administrator decided about their listing (in-app and email). */
  notifications?: {
    enqueue(
      drafts: ReadonlyArray<{
        userId: string;
        type: string;
        subject: string;
        body: string;
        link?: string;
        dedupeKey: string;
        channels: ReadonlyArray<"IN_APP" | "EMAIL">;
      }>,
    ): Promise<void>;
  };
}
