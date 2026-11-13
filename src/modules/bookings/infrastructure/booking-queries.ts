import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import { localDateFromDb } from "@/shared/domain/local-date";
import type { BookingDetail, BookingListRow, BookingQueries } from "../application/queries";
import type { BookingStatus } from "../domain/booking-state-machine";

const listInclude = {
  outfit: {
    select: {
      title: true,
      slug: true,
      images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { storageKey: true } },
    },
  },
  owner: { select: { name: true, profile: { select: { displayName: true } } } },
  renter: { select: { name: true, profile: { select: { displayName: true } } } },
} as const;

type ListRow = {
  id: string;
  reference: string;
  status: string;
  startDate: Date;
  endDate: Date;
  rentalDays: number;
  renterTotalPaise: number;
  rentalFeePaise: number;
  depositPaise: number;
  expiresAt: Date | null;
  createdAt: Date;
  outfit: { title: string; slug: string; images: Array<{ storageKey: string }> };
  owner: { name: string; profile: { displayName: string } | null };
  renter: { name: string; profile: { displayName: string } | null };
};

function toListRow(b: ListRow, counterpart: "owner" | "renter"): BookingListRow {
  const person = b[counterpart];
  return {
    id: b.id,
    reference: b.reference,
    status: b.status as BookingStatus,
    startDate: localDateFromDb(b.startDate),
    endDate: localDateFromDb(b.endDate),
    rentalDays: b.rentalDays,
    outfitTitle: b.outfit.title,
    outfitSlug: b.outfit.slug,
    photoKey: b.outfit.images[0]?.storageKey ?? null,
    counterpartName: person.profile?.displayName ?? person.name,
    renterTotalPaise: b.renterTotalPaise,
    rentalFeePaise: b.rentalFeePaise,
    depositPaise: b.depositPaise,
    expiresAt: b.expiresAt,
    createdAt: b.createdAt,
  };
}

const name = (u: { name: string; profile: { displayName: string } | null }) =>
  u.profile?.displayName ?? u.name;

export function prismaBookingQueries(db: Db): BookingQueries {
  const ids = async (where: Parameters<Db["booking"]["findMany"]>[0]) =>
    (await db.booking.findMany({ ...where, select: { id: true }, take: 200 })).map((b) => b.id);

  return {
    async forRenter(userId) {
      const rows = await db.booking.findMany({
        where: { renterId: userId },
        orderBy: { createdAt: "desc" },
        include: listInclude,
        take: 200,
      });
      return rows.map((b) => toListRow(b, "owner"));
    },

    async forOwner(userId, statuses) {
      const rows = await db.booking.findMany({
        where: { ownerId: userId, ...(statuses ? { status: { in: [...statuses] } } : {}) },
        orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
        include: listInclude,
        take: 200,
      });
      return rows.map((b) => toListRow(b, "renter"));
    },

    async detail(bookingId): Promise<BookingDetail | null> {
      const b = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          outfit: {
            select: {
              id: true,
              title: true,
              slug: true,
              locality: { select: { name: true } },
              pickupAddress: { include: { locality: { select: { name: true, city: true } } } },
              images: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
            },
          },
          owner: {
            select: { id: true, name: true, phoneNumber: true, profile: { select: { displayName: true } } },
          },
          renter: {
            select: { id: true, name: true, phoneNumber: true, profile: { select: { displayName: true } } },
          },
          payment: true,
          deposit: true,
          refunds: { orderBy: { createdAt: "asc" } },
          payout: true,
          conditionReports: {
            orderBy: { createdAt: "asc" },
            include: {
              photos: { orderBy: { sortOrder: "asc" } },
              author: { select: { name: true, profile: { select: { displayName: true } } } },
            },
          },
          disputes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                include: { author: { select: { name: true, profile: { select: { displayName: true } } } } },
              },
            },
          },
          history: { orderBy: { id: "asc" } },
        },
      });
      if (!b) return null;
      const address = b.outfit.pickupAddress;
      const d = b.disputes[0];
      return {
        id: b.id,
        reference: b.reference,
        status: b.status as BookingStatus,
        closedReason: b.closedReason,
        outfit: {
          id: b.outfit.id,
          title: b.outfit.title,
          slug: b.outfit.slug,
          photoKey: b.outfit.images[0]?.storageKey ?? null,
          localityName: b.outfit.locality.name,
        },
        owner: { id: b.owner.id, name: name(b.owner), phone: b.owner.phoneNumber },
        renter: { id: b.renter.id, name: name(b.renter), phone: b.renter.phoneNumber },
        pickupAddress: address
          ? [
              address.line1,
              address.line2,
              address.landmark,
              `${address.locality.name}, ${address.locality.city} ${address.pincode}`,
            ]
              .filter(Boolean)
              .join(", ")
          : null,
        startDate: localDateFromDb(b.startDate),
        endDate: localDateFromDb(b.endDate),
        rentalDays: b.rentalDays,
        bufferDays: b.bufferDays,
        expiresAt: b.expiresAt,
        renterNote: b.renterNote,
        money: {
          rentalFeePaise: b.rentalFeePaise,
          depositPaise: b.depositPaise,
          commissionPaise: b.commissionPaise,
          renterTotalPaise: b.renterTotalPaise,
          ownerPayoutPaise: b.ownerPayoutPaise,
          lateFeePerDayPaise: b.lateFeePerDayPaise,
          lateFeePaise: b.lateFeePaise,
          lateDays: b.lateDays,
        },
        payment: b.payment
          ? {
              id: b.payment.id,
              status: b.payment.status,
              provider: b.payment.provider,
              amountPaise: b.payment.amountPaise,
              refundedPaise: b.payment.refundedPaise,
              capturedAt: b.payment.capturedAt,
            }
          : null,
        deposit: b.deposit
          ? {
              status: b.deposit.status,
              withheldPaise: b.deposit.withheldPaise,
              lateFeePaise: b.deposit.lateFeePaise,
              damagePaise: b.deposit.damagePaise,
              settledAt: b.deposit.settledAt,
            }
          : null,
        refunds: b.refunds.map((r) => ({
          id: r.id,
          reason: r.reason,
          amountPaise: r.amountPaise,
          status: r.status,
          createdAt: r.createdAt,
        })),
        payout: b.payout
          ? {
              status: b.payout.status,
              netPaise: b.payout.netPaise,
              commissionPaise: b.payout.commissionPaise,
              grossRentalPaise: b.payout.grossRentalPaise,
              depositWithheldPaise: b.payout.depositWithheldPaise,
              paidAt: b.payout.paidAt,
              reference: b.payout.payoutReference,
            }
          : null,
        reports: b.conditionReports.map((r) => ({
          kind: r.kind,
          grade: r.grade,
          notes: r.notes,
          authorName: name(r.author),
          createdAt: r.createdAt,
          acknowledgedAt: r.acknowledgedAt,
          counterpartyNotes: r.counterpartyNotes,
          photoKeys: r.photos.map((p) => p.storageKey),
        })),
        dispute: d
          ? {
              id: d.id,
              kind: d.kind,
              description: d.description,
              status: d.status,
              openedByRole: d.openedByRole,
              openedById: d.openedById,
              openedFromStatus: d.openedFromStatus,
              claimedAmountPaise: d.claimedAmountPaise,
              resolution: d.resolution,
              resolutionNotes: d.resolutionNotes,
              messages: d.messages.map((m) => ({
                authorName: name(m.author),
                body: m.body,
                createdAt: m.createdAt,
              })),
            }
          : null,
        history: b.history.map((h) => ({
          toStatus: h.toStatus,
          command: h.command,
          actorRole: h.actorRole,
          reason: h.reason,
          createdAt: h.createdAt,
        })),
        inspectionDeadline: b.inspectionDeadline,
        approvedAt: b.approvedAt,
        confirmedAt: b.confirmedAt,
        completedAt: b.completedAt,
        policy: b.policySnapshot,
        createdAt: b.createdAt,
      };
    },

    async calendar(outfitId) {
      const holds = await db.calendarHold.findMany({
        where: { outfitId },
        orderBy: { startsOn: "asc" },
        include: { booking: { select: { reference: true, status: true } } },
      });
      return holds.map((h) => ({
        id: h.id,
        kind: h.kind,
        startsOn: localDateFromDb(h.startsOn),
        endsBefore: localDateFromDb(h.endsBefore),
        note: h.note,
        bookingReference: h.booking?.reference ?? null,
        bookingStatus: (h.booking?.status as BookingStatus | undefined) ?? null,
      }));
    },

    async payoutsForOwner(userId) {
      const rows = await db.payout.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "desc" },
        include: { booking: { select: { reference: true, outfit: { select: { title: true } } } } },
      });
      return rows.map((p) => ({
        bookingId: p.bookingId,
        reference: p.booking.reference,
        outfitTitle: p.booking.outfit.title,
        grossRentalPaise: p.grossRentalPaise,
        commissionPaise: p.commissionPaise,
        depositWithheldPaise: p.depositWithheldPaise,
        netPaise: p.netPaise,
        status: p.status,
        paidAt: p.paidAt,
        payoutReference: p.payoutReference,
        createdAt: p.createdAt,
      }));
    },

    isParticipant: async (userId, bookingId) =>
      (await db.booking.count({
        where: { id: bookingId, OR: [{ ownerId: userId }, { renterId: userId }] },
      })) === 1,

    async bookingIdForReportPhoto(storageKey) {
      const photo = await db.conditionReportPhoto.findFirst({
        where: { storageKey },
        select: { report: { select: { bookingId: true } } },
      });
      return photo?.report.bookingId ?? null;
    },

    // Oldest deadline first, so a batch limit never starves the most overdue work.
    expiredApprovals: (now) =>
      ids({
        where: { status: "PENDING_APPROVAL", expiresAt: { lte: now } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      }),
    expiredPayments: (now) =>
      ids({
        where: { status: "AWAITING_PAYMENT", expiresAt: { lte: now } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      }),
    inspectionsDue: (now) =>
      ids({
        where: { status: "RETURNED", inspectionDeadline: { lte: now } },
        orderBy: [{ inspectionDeadline: "asc" }, { id: "asc" }],
      }),
    stuckHandovers: (today) =>
      ids({
        where: { status: "CONFIRMED", endDate: { lt: new Date(`${today}T00:00:00Z`) } },
        orderBy: [{ endDate: "asc" }, { id: "asc" }],
      }),
    overdueRentals: (today) =>
      ids({
        where: { status: "ACTIVE", endDate: { lt: new Date(`${today}T00:00:00Z`) } },
        orderBy: [{ endDate: "asc" }, { id: "asc" }],
      }),
  };
}
