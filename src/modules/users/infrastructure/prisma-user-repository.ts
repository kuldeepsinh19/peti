import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { AccountOverview, AddressView, UserRepository } from "../application/ports";

const addressInclude = { locality: { select: { name: true, city: true } } } as const;

type AddressRow = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  localityId: string;
  pincode: string;
  isDefault: boolean;
  locality: { name: string; city: string };
};

function toAddressView(row: AddressRow): AddressView {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    landmark: row.landmark,
    localityId: row.localityId,
    localityName: row.locality.name,
    city: row.locality.city,
    pincode: row.pincode,
    isDefault: row.isDefault,
  };
}

const average = (sum: number, count: number) => (count === 0 ? null : Math.round((sum / count) * 10) / 10);

export function prismaUserRepository(db: Db): UserRepository {
  return {
    async getAccountOverview(userId): Promise<AccountOverview | null> {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          payoutAccount: true,
          _count: { select: { outfits: true, bookingsAsRenter: true, bookingsAsOwner: true } },
        },
      });
      if (!user) return null;
      const p = user.profile;
      return {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        phoneVerified: Boolean(user.phoneNumberVerified),
        identityVerification: user.identityVerificationStatus,
        displayName: p?.displayName ?? user.name,
        bio: p?.bio ?? null,
        memberSince: user.createdAt,
        ownerRating: {
          average: average(p?.ownerRatingSum ?? 0, p?.ownerRatingCount ?? 0),
          count: p?.ownerRatingCount ?? 0,
        },
        renterRating: {
          average: average(p?.renterRatingSum ?? 0, p?.renterRatingCount ?? 0),
          count: p?.renterRatingCount ?? 0,
        },
        payoutAccount: user.payoutAccount
          ? { upiVpa: user.payoutAccount.upiVpa, accountHolderName: user.payoutAccount.accountHolderName }
          : null,
        counts: {
          outfits: user._count.outfits,
          rentals: user._count.bookingsAsRenter,
          lendings: user._count.bookingsAsOwner,
        },
      };
    },

    async updateProfile(userId, input) {
      await db.$transaction([
        db.userProfile.upsert({
          where: { userId },
          create: { userId, displayName: input.displayName, bio: input.bio ?? null },
          update: { displayName: input.displayName, bio: input.bio ?? null },
        }),
        db.user.update({ where: { id: userId }, data: { name: input.displayName } }),
      ]);
    },

    async listAddresses(userId) {
      const rows = await db.address.findMany({
        where: { userId, deletedAt: null },
        include: addressInclude,
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
      return rows.map(toAddressView);
    },

    countAddresses: (userId) => db.address.count({ where: { userId, deletedAt: null } }),

    async addAddress(userId, input) {
      return db.$transaction(async (tx) => {
        const existing = await tx.address.count({ where: { userId, deletedAt: null } });
        const makeDefault = input.isDefault || existing === 0;
        if (makeDefault) {
          await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        }
        const row = await tx.address.create({
          data: {
            userId,
            label: input.label ?? null,
            line1: input.line1,
            line2: input.line2 ?? null,
            landmark: input.landmark ?? null,
            localityId: input.localityId,
            pincode: input.pincode,
            isDefault: makeDefault,
          },
          include: addressInclude,
        });
        return toAddressView(row);
      });
    },

    async removeAddress(userId, addressId) {
      const result = await db.address.updateMany({
        where: { id: addressId, userId, deletedAt: null },
        data: { deletedAt: new Date(), isDefault: false },
      });
      return result.count === 1;
    },

    async setDefaultAddress(userId, addressId) {
      return db.$transaction(async (tx) => {
        const target = await tx.address.findFirst({ where: { id: addressId, userId, deletedAt: null } });
        if (!target) return false;
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
        return true;
      });
    },

    async upsertPayoutAccount(userId, input) {
      await db.ownerPayoutAccount.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
    },

    localityExists: async (localityId) =>
      (await db.locality.count({ where: { id: localityId, isActive: true } })) === 1,

    listLocalities: () =>
      db.locality.findMany({
        where: { isActive: true },
        select: { id: true, name: true, city: true },
        orderBy: { name: "asc" },
      }),
  };
}
