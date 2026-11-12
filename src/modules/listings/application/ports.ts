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
  photoKey: string | null;
  openBookings: number;
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
  update(outfitId: string, data: ListingData, status: OutfitStatus): Promise<void>;
  findOwned(outfitId: string): Promise<OwnedOutfit | null>;
  getForEdit(outfitId: string): Promise<ListingEditView | null>;
  listForOwner(ownerId: string): Promise<OwnerListingRow[]>;
  /** Compare-and-swap: changes the status only if it is still `from`; false when someone else changed it. */
  setStatus(
    outfitId: string,
    from: OutfitStatus,
    status: OutfitStatus,
    extra?: { moderationNote?: string | null; publishedAt?: Date; submittedAt?: Date },
  ): Promise<boolean>;
  addPhoto(outfitId: string, photo: Omit<ListingPhoto, "id" | "sortOrder">): Promise<ListingPhoto>;
  removePhoto(outfitId: string, photoId: string): Promise<ListingPhoto | null>;
  countOpenBookings(outfitId: string): Promise<number>;
  addressBelongsTo(addressId: string, userId: string): Promise<boolean>;
  categoryAndLocalityExist(categoryId: string, localityId: string): Promise<boolean>;
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
}
