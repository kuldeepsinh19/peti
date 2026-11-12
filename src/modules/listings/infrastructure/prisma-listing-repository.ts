import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/infrastructure/prisma";
import type { ListingData, ListingEditView, ListingRepository } from "../application/ports";
import type { OutfitStatus } from "../domain/outfit-status";

const OPEN_BOOKING_STATUSES = [
  "PENDING_APPROVAL",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "ACTIVE",
  "RETURNED",
  "DISPUTED",
] as const;

function measurementColumns(data: ListingData) {
  const m = data.measurementsMm;
  return {
    chestMm: m.chest,
    waistMm: m.waist,
    hipMm: m.hip,
    shoulderMm: m.shoulder,
    sleeveMm: m.sleeve,
    lengthMm: m.length,
    bottomWaistMm: m.bottomWaist,
    bottomLengthMm: m.bottomLength,
    notes: data.measurementNotes,
  };
}

function outfitColumns(data: ListingData) {
  return {
    title: data.title,
    description: data.description,
    categoryId: data.categoryId,
    brand: data.brand,
    colour: data.colour,
    fabric: data.fabric,
    sizeLabel: data.sizeLabel as Prisma.OutfitCreateInput["sizeLabel"],
    conditionGrade: data.conditionGrade as Prisma.OutfitCreateInput["conditionGrade"],
    conditionNotes: data.conditionNotes,
    retailValuePaise: data.retailValuePaise,
    depositPaise: data.depositPaise,
    turnaroundDays: data.turnaroundDays,
    occasions: data.occasions as Prisma.OutfitCreateInput["occasions"],
    localityId: data.localityId,
    pickupAddressId: data.pickupAddressId,
    minPricePaise: data.prices.length ? Math.min(...data.prices.map((p) => p.pricePaise)) : null,
  };
}

export function prismaListingRepository(db: Db): ListingRepository {
  return {
    async create(ownerId, slug, data) {
      const outfit = await db.outfit.create({
        data: {
          ownerId,
          slug,
          status: "DRAFT",
          ...outfitColumns(data),
          measurements: { create: measurementColumns(data) },
          priceOptions: { create: data.prices },
        },
        select: { id: true, slug: true },
      });
      return outfit;
    },

    async update(outfitId, data, status) {
      await db.$transaction(async (tx) => {
        await tx.outfit.update({ where: { id: outfitId }, data: { ...outfitColumns(data), status } });
        await tx.outfitMeasurement.upsert({
          where: { outfitId },
          create: { outfitId, ...measurementColumns(data) },
          update: measurementColumns(data),
        });
        // Price options referenced by past bookings are deactivated, never deleted (the booking keeps its
        // own snapshot either way).
        const offered = new Set(data.prices.map((p) => p.durationDays));
        await tx.outfitPriceOption.updateMany({
          where: { outfitId, durationDays: { notIn: [...offered] } },
          data: { isActive: false },
        });
        for (const p of data.prices) {
          await tx.outfitPriceOption.upsert({
            where: { outfitId_durationDays: { outfitId, durationDays: p.durationDays } },
            create: { outfitId, durationDays: p.durationDays, pricePaise: p.pricePaise },
            update: { pricePaise: p.pricePaise, isActive: true },
          });
        }
      });
    },

    async findOwned(outfitId) {
      const o = await db.outfit.findUnique({
        where: { id: outfitId },
        select: {
          id: true,
          ownerId: true,
          slug: true,
          status: true,
          title: true,
          description: true,
          categoryId: true,
          _count: { select: { images: true } },
        },
      });
      return o ? { ...o, status: o.status as OutfitStatus, photoCount: o._count.images } : null;
    },

    async getForEdit(outfitId): Promise<ListingEditView | null> {
      const o = await db.outfit.findUnique({
        where: { id: outfitId },
        include: {
          measurements: true,
          priceOptions: { where: { isActive: true }, orderBy: { durationDays: "asc" } },
          images: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!o) return null;
      const m = o.measurements;
      return {
        id: o.id,
        slug: o.slug,
        status: o.status as OutfitStatus,
        moderationNote: o.moderationNote,
        title: o.title,
        description: o.description,
        categoryId: o.categoryId,
        brand: o.brand,
        colour: o.colour,
        fabric: o.fabric,
        sizeLabel: o.sizeLabel,
        conditionGrade: o.conditionGrade,
        conditionNotes: o.conditionNotes,
        retailValuePaise: o.retailValuePaise,
        depositPaise: o.depositPaise,
        turnaroundDays: o.turnaroundDays,
        occasions: o.occasions,
        localityId: o.localityId,
        pickupAddressId: o.pickupAddressId ?? "",
        prices: o.priceOptions.map((p) => ({ durationDays: p.durationDays, pricePaise: p.pricePaise })),
        measurementsMm: {
          chest: m?.chestMm ?? null,
          waist: m?.waistMm ?? null,
          hip: m?.hipMm ?? null,
          shoulder: m?.shoulderMm ?? null,
          sleeve: m?.sleeveMm ?? null,
          length: m?.lengthMm ?? null,
          bottomWaist: m?.bottomWaistMm ?? null,
          bottomLength: m?.bottomLengthMm ?? null,
        },
        measurementNotes: m?.notes ?? null,
        photos: o.images.map((i) => ({
          id: i.id,
          storageKey: i.storageKey,
          altText: i.altText,
          width: i.width,
          height: i.height,
          sortOrder: i.sortOrder,
        })),
      };
    },

    async listForOwner(ownerId) {
      const rows = await db.outfit.findMany({
        where: { ownerId, status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
        include: {
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
          _count: { select: { bookings: { where: { status: { in: [...OPEN_BOOKING_STATUSES] } } } } },
        },
      });
      return rows.map((o) => ({
        id: o.id,
        slug: o.slug,
        title: o.title,
        status: o.status as OutfitStatus,
        categoryName: o.category.name,
        minPricePaise: o.minPricePaise,
        photoKey: o.images[0]?.storageKey ?? null,
        openBookings: o._count.bookings,
        updatedAt: o.updatedAt,
      }));
    },

    async setStatus(outfitId, from, status, extra = {}) {
      const result = await db.outfit.updateMany({
        where: { id: outfitId, status: from },
        data: { status, ...extra },
      });
      return result.count === 1;
    },

    async addPhoto(outfitId, photo) {
      const last = await db.outfitImage.aggregate({ where: { outfitId }, _max: { sortOrder: true } });
      const row = await db.outfitImage.create({
        data: { outfitId, ...photo, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      return {
        id: row.id,
        storageKey: row.storageKey,
        altText: row.altText,
        width: row.width,
        height: row.height,
        sortOrder: row.sortOrder,
      };
    },

    async removePhoto(outfitId, photoId) {
      const row = await db.outfitImage.findFirst({ where: { id: photoId, outfitId } });
      if (!row) return null;
      await db.outfitImage.delete({ where: { id: row.id } });
      return { ...row };
    },

    countOpenBookings: (outfitId) =>
      db.booking.count({ where: { outfitId, status: { in: [...OPEN_BOOKING_STATUSES] } } }),

    addressBelongsTo: async (addressId, userId) =>
      (await db.address.count({ where: { id: addressId, userId, deletedAt: null } })) === 1,

    async categoryAndLocalityExist(categoryId, localityId) {
      const [c, l] = await Promise.all([
        db.outfitCategory.count({ where: { id: categoryId, isActive: true } }),
        db.locality.count({ where: { id: localityId, isActive: true } }),
      ]);
      return c === 1 && l === 1;
    },

    async listForModeration(statuses) {
      const rows = await db.outfit.findMany({
        where: { status: { in: [...statuses] } },
        orderBy: [{ submittedAt: "asc" }, { updatedAt: "desc" }],
        take: 100,
        include: {
          owner: { select: { name: true, profile: { select: { displayName: true } } } },
          category: { select: { name: true } },
          locality: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
          _count: { select: { images: true } },
        },
      });
      return rows.map((o) => ({
        id: o.id,
        slug: o.slug,
        title: o.title,
        status: o.status as OutfitStatus,
        ownerName: o.owner.profile?.displayName ?? o.owner.name,
        categoryName: o.category.name,
        localityName: o.locality.name,
        minPricePaise: o.minPricePaise,
        retailValuePaise: o.retailValuePaise,
        depositPaise: o.depositPaise,
        photoKey: o.images[0]?.storageKey ?? null,
        photoCount: o._count.images,
        submittedAt: o.submittedAt,
        moderationNote: o.moderationNote,
      }));
    },
  };
}
