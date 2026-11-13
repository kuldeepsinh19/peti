import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import { localDateFromDb } from "@/shared/domain/local-date";
import type { AdminBookingRow, AdminRepository, Metrics } from "../application/admin";

const name = (u: { name: string; profile: { displayName: string } | null }) =>
  u.profile?.displayName ?? u.name;
const person = { select: { name: true, profile: { select: { displayName: true } } } } as const;
const bookingInclude = { outfit: { select: { title: true } }, owner: person, renter: person } as const;

type BookingWithPeople = {
  id: string;
  reference: string;
  status: string;
  startDate: Date;
  renterTotalPaise: number;
  createdAt: Date;
  outfit: { title: string };
  owner: { name: string; profile: { displayName: string } | null };
  renter: { name: string; profile: { displayName: string } | null };
};

const toBookingRow = (b: BookingWithPeople): AdminBookingRow => ({
  id: b.id,
  reference: b.reference,
  status: b.status,
  outfitTitle: b.outfit.title,
  ownerName: name(b.owner),
  renterName: name(b.renter),
  startDate: localDateFromDb(b.startDate),
  renterTotalPaise: b.renterTotalPaise,
  createdAt: b.createdAt,
});

export function prismaAdminRepository(db: Db): AdminRepository {
  return {
    async metrics(): Promise<Metrics> {
      const [
        users,
        verifiedUsers,
        suspendedUsers,
        listings,
        bookings,
        completed,
        commission,
        pending,
        openDisputes,
        pendingRefunds,
        failedRefunds,
        imbalance,
      ] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { emailVerified: true, phoneNumberVerified: true } }),
        db.user.count({ where: { banned: true } }),
        db.outfit.groupBy({ by: ["status"], _count: { _all: true } }),
        db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
        db.booking.aggregate({ where: { status: "COMPLETED" }, _sum: { rentalFeePaise: true } }),
        db.payout.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { commissionPaise: true } }),
        db.payout.aggregate({
          where: { status: "PENDING" },
          _sum: { netPaise: true },
          _count: { _all: true },
        }),
        db.dispute.count({ where: { status: "OPEN" } }),
        db.refund.count({ where: { status: { in: ["PENDING", "INITIATED"] } } }),
        db.refund.count({ where: { status: "FAILED" } }),
        db.$queryRaw<
          Array<{ n: bigint }>
        >`SELECT COUNT(*) AS n FROM v_booking_money_reconciliation WHERE imbalance_paise <> 0`,
      ]);
      return {
        users,
        verifiedUsers,
        suspendedUsers,
        listings: Object.fromEntries(listings.map((l) => [l.status, l._count._all])),
        bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count._all])),
        completedRentalFeePaise: completed._sum.rentalFeePaise ?? 0,
        commissionEarnedPaise: commission._sum.commissionPaise ?? 0,
        pendingPayoutsPaise: pending._sum.netPaise ?? 0,
        pendingPayouts: pending._count._all,
        openDisputes,
        pendingRefunds,
        failedRefunds,
        reconciliationIssues: Number(imbalance[0]?.n ?? 0),
      };
    },

    async users(search) {
      const rows = await db.user.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          profile: { select: { ownerCancellationCount: true } },
          _count: { select: { outfits: true, bookingsAsRenter: true } },
        },
      });
      return rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phoneNumber,
        emailVerified: u.emailVerified,
        phoneVerified: Boolean(u.phoneNumberVerified),
        role: u.role,
        banned: Boolean(u.banned),
        banReason: u.banReason,
        createdAt: u.createdAt,
        outfits: u._count.outfits,
        rentals: u._count.bookingsAsRenter,
        ownerCancellations: u.profile?.ownerCancellationCount ?? 0,
      }));
    },

    async findUser(userId) {
      const u = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, banned: true },
      });
      return u ? { id: u.id, role: u.role, banned: Boolean(u.banned) } : null;
    },

    async setBanned(userId, banned, reason) {
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { banned, banReason: reason, banExpires: null } }),
        ...(banned ? [db.session.deleteMany({ where: { userId } })] : []),
      ]);
    },

    async bookings(status) {
      const rows = await db.booking.findMany({
        where: status ? { status: status as never } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        include: bookingInclude,
      });
      return rows.map(toBookingRow);
    },

    async openDisputes() {
      const rows = await db.booking.findMany({
        where: { disputes: { some: { status: "OPEN" } } },
        orderBy: { statusChangedAt: "asc" },
        include: bookingInclude,
      });
      return rows.map(toBookingRow);
    },

    async payouts(status) {
      const rows = await db.payout.findMany({
        where: status ? { status: status as never } : {},
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          booking: { select: { reference: true } },
          owner: {
            select: {
              name: true,
              profile: { select: { displayName: true } },
              payoutAccount: { select: { upiVpa: true } },
            },
          },
        },
      });
      return rows.map((p) => ({
        id: p.id,
        bookingId: p.bookingId,
        reference: p.booking.reference,
        ownerName: name(p.owner),
        upiVpa: p.owner.payoutAccount?.upiVpa ?? null,
        netPaise: p.netPaise,
        status: p.status,
        payoutReference: p.payoutReference,
        createdAt: p.createdAt,
      }));
    },

    findPayout: (payoutId) =>
      db.payout.findUnique({
        where: { id: payoutId },
        select: { id: true, status: true, bookingId: true, netPaise: true },
      }),

    async markPayoutPaid(payoutId, reference, paidBy, at) {
      const result = await db.payout.updateMany({
        where: { id: payoutId, status: "PENDING" },
        data: { status: "PAID", payoutReference: reference, paidById: paidBy, paidAt: at },
      });
      return result.count === 1;
    },

    async audit(limit) {
      const rows = await db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { actor: person },
      });
      return rows.map((a) => ({
        id: a.id,
        actorName: a.actor ? name(a.actor) : null,
        actorRole: a.actorRole,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        reason: a.reason,
        createdAt: a.createdAt,
      }));
    },

    async failedRefunds() {
      const rows = await db.refund.findMany({
        where: { status: "FAILED" },
        orderBy: { createdAt: "asc" },
        include: { booking: { select: { reference: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        reference: r.booking.reference,
        amountPaise: r.amountPaise,
        attempts: r.attempts,
        lastError: r.lastError,
      }));
    },

    async retryRefund(refundId) {
      const result = await db.refund.updateMany({
        where: { id: refundId, status: "FAILED" },
        data: { status: "PENDING", attempts: 0 },
      });
      return result.count === 1;
    },

    async categories() {
      const rows = await db.outfitCategory.findMany({
        orderBy: [{ sortOrder: "asc" }],
        include: { _count: { select: { outfits: true } } },
      });
      return rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        audience: c.audience,
        isActive: c.isActive,
        outfits: c._count.outfits,
      }));
    },

    categorySlugExists: async (slug) => (await db.outfitCategory.count({ where: { slug } })) > 0,

    async createCategory(input) {
      const last = await db.outfitCategory.aggregate({ _max: { sortOrder: true } });
      const row = await db.outfitCategory.create({
        data: { ...input, audience: input.audience as never, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      });
      return row.id;
    },

    async setCategoryActive(categoryId, active) {
      const result = await db.outfitCategory.updateMany({
        where: { id: categoryId },
        data: { isActive: active },
      });
      return result.count === 1;
    },
  };
}
