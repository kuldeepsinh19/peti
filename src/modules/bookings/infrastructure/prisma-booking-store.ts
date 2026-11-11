import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { NotificationWriter } from "@/modules/notifications";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import type { Tx } from "@/shared/infrastructure/prisma";
import { localDateFromDb, localDateToDb } from "@/shared/domain/local-date";
import { readPolicySnapshot } from "../domain/booking-rules";
import type { BookingStatus } from "../domain/booking-state-machine";
import type { BookingRecord, BookingStore } from "../application/ports";

interface BookingRow {
  id: string;
  reference: string;
  outfit_id: string;
  outfit_title: string;
  outfit_slug: string;
  owner_id: string;
  renter_id: string;
  start_date: Date;
  end_date: Date;
  rental_days: number;
  buffer_days: number;
  status: BookingStatus;
  expires_at: Date | null;
  rental_fee_paise: number;
  deposit_paise: number;
  commission_rate_bps: number;
  renter_total_paise: number;
  late_fee_per_day_paise: number;
  late_fee_paise: number | null;
  policy_snapshot: unknown;
  handed_over_at: Date | null;
  inspection_deadline: Date | null;
}

function toRecord(r: BookingRow): BookingRecord {
  return {
    id: r.id,
    reference: r.reference,
    outfitId: r.outfit_id,
    outfitTitle: r.outfit_title,
    outfitSlug: r.outfit_slug,
    ownerId: r.owner_id,
    renterId: r.renter_id,
    startDate: localDateFromDb(r.start_date),
    endDate: localDateFromDb(r.end_date),
    rentalDays: r.rental_days,
    bufferDays: r.buffer_days,
    status: r.status,
    expiresAt: r.expires_at,
    rentalFeePaise: r.rental_fee_paise,
    depositPaise: r.deposit_paise,
    commissionRateBps: r.commission_rate_bps,
    renterTotalPaise: r.renter_total_paise,
    lateFeePerDayPaise: r.late_fee_per_day_paise,
    lateFeePaise: r.late_fee_paise,
    policy: readPolicySnapshot(r.policy_snapshot),
    handedOverAt: r.handed_over_at,
    inspectionDeadline: r.inspection_deadline,
  };
}

/** BookingStore bound to one interactive transaction (see shared/infrastructure/unit-of-work.ts). */
export function prismaBookingStore(tx: Tx, notifications: NotificationWriter): BookingStore {
  const auditLog = prismaAuditLog(tx);

  return {
    async lockOutfit(outfitId, lock = true) {
      const rows = lock
        ? await tx.$queryRaw<
            Array<{
              id: string;
              owner_id: string;
              status: string;
              title: string;
              deposit_paise: number;
              turnaround_days: number;
            }>
          >`
            SELECT id, owner_id, status::text AS status, title, deposit_paise, turnaround_days
            FROM outfits WHERE id = ${outfitId}::uuid FOR NO KEY UPDATE`
        : await tx.$queryRaw<
            Array<{
              id: string;
              owner_id: string;
              status: string;
              title: string;
              deposit_paise: number;
              turnaround_days: number;
            }>
          >`
            SELECT id, owner_id, status::text AS status, title, deposit_paise, turnaround_days
            FROM outfits WHERE id = ${outfitId}::uuid`;
      const o = rows[0];
      return o
        ? {
            id: o.id,
            ownerId: o.owner_id,
            status: o.status,
            title: o.title,
            depositPaise: o.deposit_paise,
            turnaroundDays: o.turnaround_days,
          }
        : null;
    },

    findPriceOption: (outfitId, durationDays) =>
      tx.outfitPriceOption.findFirst({
        where: { outfitId, durationDays, isActive: true },
        select: { id: true, pricePaise: true },
      }),

    async isRangeFree(outfitId, startsOn, endsBefore) {
      const rows = await tx.$queryRaw<Array<{ taken: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM calendar_holds
          WHERE outfit_id = ${outfitId}::uuid
            AND daterange(starts_on, ends_before, '[)') && daterange(${startsOn}::date, ${endsBefore}::date, '[)')
        ) AS taken`;
      return !rows[0]?.taken;
    },

    async insertBooking(b) {
      const row = await tx.booking.create({
        data: {
          reference: b.reference,
          outfitId: b.outfitId,
          ownerId: b.ownerId,
          renterId: b.renterId,
          startDate: localDateToDb(b.startDate),
          endDate: localDateToDb(b.endDate),
          rentalDays: b.rentalDays,
          bufferDays: b.bufferDays,
          expiresAt: b.expiresAt,
          priceOptionId: b.priceOptionId,
          ...b.pricing,
          termsVersion: b.termsVersion,
          policySnapshot: b.policy as unknown as Prisma.InputJsonValue,
          renterAcceptedAt: b.requestedAt,
          renterNote: b.renterNote,
          createdAt: b.requestedAt,
          statusChangedAt: b.requestedAt,
        },
        select: { id: true },
      });
      return row.id;
    },

    async getBooking(bookingId, opts = {}) {
      const lock = opts.lock ?? true;
      const rows = await tx.$queryRaw<BookingRow[]>`
        SELECT b.id, b.reference, b.outfit_id, o.title AS outfit_title, o.slug AS outfit_slug, b.owner_id, b.renter_id,
               b.start_date, b.end_date, b.rental_days, b.buffer_days, b.status::text AS status, b.expires_at,
               b.rental_fee_paise, b.deposit_paise, b.commission_rate_bps, b.renter_total_paise,
               b.late_fee_per_day_paise, b.late_fee_paise, b.policy_snapshot, b.handed_over_at, b.inspection_deadline
        FROM bookings b JOIN outfits o ON o.id = b.outfit_id
        WHERE b.id = ${bookingId}::uuid
        ${lock ? Prisma.sql`FOR UPDATE OF b` : Prisma.empty}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async updateStatus(bookingId, from, to, patch) {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, status: from },
        data: {
          status: to,
          version: { increment: 1 },
          statusChangedAt: new Date(),
          ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
          ...(patch.closedReason ? { closedReason: patch.closedReason } : {}),
          ...(patch.approvedAt ? { approvedAt: patch.approvedAt } : {}),
          ...(patch.ownerAcceptedAt ? { ownerAcceptedAt: patch.ownerAcceptedAt } : {}),
          ...(patch.confirmedAt ? { confirmedAt: patch.confirmedAt } : {}),
          ...(patch.handedOverAt ? { handedOverAt: patch.handedOverAt } : {}),
          ...(patch.returnedAt ? { returnedAt: patch.returnedAt } : {}),
          ...(patch.returnedOn ? { returnedOn: localDateToDb(patch.returnedOn) } : {}),
          ...(patch.lateDays !== undefined ? { lateDays: patch.lateDays } : {}),
          ...(patch.lateFeePaise !== undefined ? { lateFeePaise: patch.lateFeePaise } : {}),
          ...(patch.inspectionDeadline !== undefined ? { inspectionDeadline: patch.inspectionDeadline } : {}),
          ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
          ...(patch.cancelledAt ? { cancelledAt: patch.cancelledAt } : {}),
        },
      });
      return result.count === 1;
    },

    async appendHistory(e) {
      const row = await tx.bookingStatusHistory.create({
        data: {
          bookingId: e.bookingId,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          command: e.command,
          actorRole: e.actorRole,
          actorUserId: e.actorUserId,
          reason: e.reason ?? null,
          ...(e.metadata ? { metadata: e.metadata as Prisma.InputJsonValue } : {}),
        },
        select: { id: true },
      });
      return row.id;
    },

    // ON CONFLICT … DO NOTHING keeps the transaction usable when the exclusion constraint finds an overlap.
    async insertHold(bookingId, outfitId, startsOn, endsBefore, createdBy) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO calendar_holds (outfit_id, kind, booking_id, starts_on, ends_before, created_by)
        VALUES (${outfitId}::uuid, 'BOOKING', ${bookingId}::uuid, ${startsOn}::date, ${endsBefore}::date, ${createdBy}::uuid)
        ON CONFLICT ON CONSTRAINT calendar_holds_no_overlap DO NOTHING
        RETURNING id`;
      return rows.length === 1;
    },

    async deleteHold(bookingId) {
      await tx.calendarHold.deleteMany({ where: { bookingId } });
    },

    async insertBlock(outfitId, startsOn, endsBefore, note, createdBy) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO calendar_holds (outfit_id, kind, starts_on, ends_before, note, created_by)
        VALUES (${outfitId}::uuid, 'OWNER_BLOCK', ${startsOn}::date, ${endsBefore}::date, ${note}, ${createdBy}::uuid)
        ON CONFLICT ON CONSTRAINT calendar_holds_no_overlap DO NOTHING
        RETURNING id`;
      return rows[0]?.id ?? null;
    },

    async deleteBlock(holdId, outfitId) {
      const result = await tx.calendarHold.deleteMany({
        where: { id: holdId, outfitId, kind: "OWNER_BLOCK" },
      });
      return result.count === 1;
    },

    async pendingOverlapping(outfitId, startsOn, endsBefore, exceptBookingId) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM bookings
        WHERE outfit_id = ${outfitId}::uuid AND status = 'PENDING_APPROVAL'
          AND id <> ${exceptBookingId ?? "00000000-0000-0000-0000-000000000000"}::uuid
          AND daterange(start_date, end_date + 1 + buffer_days, '[)') && daterange(${startsOn}::date, ${endsBefore}::date, '[)')`;
      return rows.map((r) => r.id);
    },

    async getPayment(bookingId, opts = {}) {
      const rows = opts.lock
        ? await tx.$queryRaw<
            Array<{
              id: string;
              provider: string;
              status: string;
              amount_paise: number;
              refunded_paise: number;
              provider_payment_id: string | null;
            }>
          >`
            SELECT id, provider, status::text AS status, amount_paise, refunded_paise, provider_payment_id
            FROM payments WHERE booking_id = ${bookingId}::uuid FOR UPDATE`
        : await tx.$queryRaw<
            Array<{
              id: string;
              provider: string;
              status: string;
              amount_paise: number;
              refunded_paise: number;
              provider_payment_id: string | null;
            }>
          >`
            SELECT id, provider, status::text AS status, amount_paise, refunded_paise, provider_payment_id
            FROM payments WHERE booking_id = ${bookingId}::uuid`;
      const p = rows[0];
      return p
        ? {
            id: p.id,
            provider: p.provider,
            status: p.status as "CREATED" | "AUTHORIZED" | "CAPTURED" | "ABANDONED",
            amountPaise: p.amount_paise,
            refundedPaise: p.refunded_paise,
            providerPaymentId: p.provider_payment_id,
          }
        : null;
    },

    async markPaymentCaptured(paymentId, providerPaymentId, method, at) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "CAPTURED", providerPaymentId, method, capturedAt: at },
      });
    },

    async abandonPayment(bookingId) {
      await tx.payment.updateMany({
        where: { bookingId, status: { in: ["CREATED", "AUTHORIZED"] } },
        data: { status: "ABANDONED" },
      });
    },

    async createHeldDeposit(bookingId, paymentId, amountPaise) {
      await tx.securityDeposit.create({ data: { bookingId, paymentId, amountPaise } });
    },

    async settleDeposit(bookingId, o) {
      await tx.securityDeposit.update({
        where: { bookingId },
        data: {
          status: o.status,
          lateFeePaise: o.lateFeePaise,
          damagePaise: o.damagePaise,
          withheldPaise: o.withheldPaise,
          settlementBasis: o.basis,
          settledAt: o.at,
        },
      });
    },

    async insertRefund(r) {
      await tx.refund.create({ data: { ...r, status: "PENDING" } });
      // The CHECK payments_refunded_within_amount makes over-refunding impossible.
      await tx.payment.update({
        where: { id: r.paymentId },
        data: { refundedPaise: { increment: r.amountPaise } },
      });
    },

    async insertPayout(p) {
      await tx.payout.create({ data: p });
    },

    async incrementOwnerCancellations(ownerId) {
      await tx.userProfile.update({
        where: { userId: ownerId },
        data: { ownerCancellationCount: { increment: 1 } },
      });
    },

    async getConditionReport(bookingId, kind) {
      const r = await tx.conditionReport.findUnique({
        where: { bookingId_kind: { bookingId, kind } },
        include: { _count: { select: { photos: true } } },
      });
      return r
        ? {
            id: r.id,
            kind: r.kind,
            authorId: r.authorId,
            photoCount: r._count.photos,
            acknowledgedAt: r.acknowledgedAt,
            lockedAt: r.lockedAt,
          }
        : null;
    },

    async saveConditionReport(report) {
      const existing = await tx.conditionReport.findUnique({
        where: { bookingId_kind: { bookingId: report.bookingId, kind: report.kind } },
      });
      if (existing) {
        await tx.conditionReportPhoto.deleteMany({ where: { reportId: existing.id } });
        await tx.conditionReport.update({
          where: { id: existing.id },
          data: { grade: report.grade as never, notes: report.notes, authorId: report.authorId },
        });
      }
      const reportId =
        existing?.id ??
        (
          await tx.conditionReport.create({
            data: {
              bookingId: report.bookingId,
              kind: report.kind,
              authorId: report.authorId,
              grade: report.grade as never,
              notes: report.notes,
            },
            select: { id: true },
          })
        ).id;
      await tx.conditionReportPhoto.createMany({
        data: report.photos.map((p, i) => ({
          reportId,
          storageKey: p.storageKey,
          caption: p.caption,
          uploadedById: report.authorId,
          sortOrder: i,
        })),
      });
    },

    async acknowledgeReport(reportId, userId, at, notes) {
      await tx.conditionReport.update({
        where: { id: reportId },
        data: { acknowledgedById: userId, acknowledgedAt: at, counterpartyNotes: notes, lockedAt: at },
      });
    },

    hasOpenDispute: async (bookingId) =>
      (await tx.dispute.count({ where: { bookingId, status: "OPEN" } })) > 0,

    async insertDispute(d) {
      const row = await tx.dispute.create({
        data: {
          bookingId: d.bookingId,
          openedById: d.openedById,
          openedByRole: d.openedByRole,
          openedFromStatus: d.openedFromStatus,
          kind: d.kind as never,
          description: d.description,
          claimedAmountPaise: d.claimedAmountPaise,
        },
        select: { id: true },
      });
      return row.id;
    },

    async getOpenDispute(bookingId) {
      const d = await tx.dispute.findFirst({ where: { bookingId, status: "OPEN" } });
      return d
        ? {
            id: d.id,
            openedById: d.openedById,
            openedByRole: d.openedByRole,
            openedFromStatus: d.openedFromStatus as BookingStatus,
            kind: d.kind,
            claimedAmountPaise: d.claimedAmountPaise,
          }
        : null;
    },

    async resolveDispute(disputeId, r) {
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: "RESOLVED",
          resolution: r.resolution,
          resolvedById: r.resolvedById,
          resolvedAt: r.at,
          resolutionNotes: r.notes,
          awardedDepositPaise: r.awardedDepositPaise,
          rentalRefundPaise: r.rentalRefundPaise,
        },
      });
    },

    async addDisputeMessage(disputeId, authorId, body) {
      await tx.disputeMessage.create({ data: { disputeId, authorId, body } });
    },

    notify: (drafts) => notifications.enqueue(drafts),
    audit: (entry) => auditLog.record(entry),
  };
}
