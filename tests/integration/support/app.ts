import { listingsUseCases } from "@/modules/listings";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import type { PhotoStore } from "@/modules/listings";
import { searchUseCases } from "@/modules/search";
import { prismaCatalogueQueries } from "@/modules/search/infrastructure/catalogue-queries";
import type { UserActor } from "@/shared/application/actor";
import { fixedClock } from "@/shared/domain/clock";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { db } from "./db";

/** In-memory photo store: integration tests exercise the database, not image processing. */
export const memoryPhotos: PhotoStore & { saved: string[] } = {
  saved: [],
  async save(outfitId) {
    const storageKey = `outfits/${outfitId}/${memoryPhotos.saved.length}.jpg`;
    memoryPhotos.saved.push(storageKey);
    return { storageKey, width: 900, height: 1200 };
  },
  async remove() {},
};

export const clock = fixedClock("2026-12-01T06:30:00Z"); // 12:00 IST

export function buildApp() {
  return {
    listings: listingsUseCases({
      listings: prismaListingRepository(db),
      photos: memoryPhotos,
      audit: prismaAuditLog(db),
      clock,
    }),
    search: searchUseCases({ catalogue: prismaCatalogueQueries(db), clock }),
  };
}

export function actorFor(
  user: { id: string; name: string; email: string; role?: string },
  overrides: Partial<UserActor> = {},
): UserActor {
  return {
    kind: "user",
    userId: user.id,
    displayName: user.name,
    email: user.email,
    isAdmin: user.role === "admin",
    emailVerified: true,
    phoneVerified: true,
    ...overrides,
  };
}
