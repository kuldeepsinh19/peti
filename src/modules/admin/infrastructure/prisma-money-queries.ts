import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { MoneyHealthCounts, MoneyQueries } from "../application/money-health";

/** Audit actions that belong on a booking's money timeline. */
const MONEY_ACTIONS = ["payment.", "refund.", "payout.", "dispute."];

export function prismaMoneyQueries(db: Db): MoneyQueries {
  return {
    async counts() {
      // One round trip. Thresholds: a queued refund should be sent within the hour (2 h allows a slow
      // scheduler); normal-speed refunds settle in 5–7 working days (10 days); an authorisation is
      // captured in seconds (waiting after 3 attempts or an hour means something is wrong).
      const rows = await db.$queryRaw<Array<Record<keyof MoneyHealthCounts, number>>>`
        SELECT
          (SELECT count(*) FROM refunds
            WHERE reason = 'UNEXPECTED_CAPTURE_REVERSAL' AND status <> 'PROCESSED')::int
            AS "unexpectedCapturesOutstanding",
          (SELECT count(*) FROM refunds WHERE status = 'FAILED')::int AS "refundsFailed",
          (SELECT count(*) FROM refunds
            WHERE status = 'PENDING' AND created_at < now() - interval '2 hours')::int AS "refundsNotSent",
          (SELECT count(*) FROM refunds
            WHERE status = 'INITIATED' AND initiated_at < now() - interval '10 days')::int AS "refundsStuck",
          (SELECT count(*) FROM v_booking_money_reconciliation WHERE imbalance_paise <> 0)::int
            AS "reconciliationImbalances",
          (SELECT count(*) FROM payments
            WHERE status = 'AUTHORIZED'
              AND (capture_attempts >= 3 OR updated_at < now() - interval '1 hour'))::int
            AS "authorizationsWaiting",
          (SELECT count(*) FROM provider_events
            WHERE status = 'FAILED' AND received_at > now() - interval '7 days')::int
            AS "providerEventsFailed",
          (SELECT count(*) FROM payment_disputes WHERE status = 'OPEN')::int AS "chargebacksOpen",
          (SELECT count(*) FROM payouts WHERE status = 'FAILED')::int AS "payoutsFailed",
          (SELECT count(*) FROM payment_disputes
            WHERE status = 'LOST' AND updated_at > now() - interval '30 days')::int
            AS "chargebacksLostRecently"`;
      return rows[0]!;
    },

    async attention() {
      const [unexpectedCaptures, chargebacks, authorizations, failedEvents] = await Promise.all([
        db.refund.findMany({
          where: { reason: "UNEXPECTED_CAPTURE_REVERSAL", status: { not: "PROCESSED" } },
          orderBy: { createdAt: "asc" },
          take: 50,
          select: {
            id: true,
            bookingId: true,
            amountPaise: true,
            status: true,
            lastError: true,
            createdAt: true,
            booking: { select: { reference: true } },
          },
        }),
        db.paymentDispute.findMany({
          where: { status: "OPEN" },
          orderBy: { createdAt: "asc" },
          take: 50,
          select: {
            id: true,
            bookingId: true,
            amountPaise: true,
            reasonCode: true,
            status: true,
            createdAt: true,
            booking: { select: { reference: true } },
          },
        }),
        db.payment.findMany({
          where: { status: "AUTHORIZED" },
          orderBy: { updatedAt: "asc" },
          take: 50,
          select: {
            bookingId: true,
            amountPaise: true,
            captureAttempts: true,
            lastCaptureError: true,
            updatedAt: true,
            booking: { select: { reference: true } },
          },
        }),
        db.providerEvent.findMany({
          where: { status: "FAILED", receivedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          orderBy: { receivedAt: "desc" },
          take: 50,
          select: { id: true, eventType: true, lastError: true, receivedAt: true },
        }),
      ]);
      return {
        unexpectedCaptures: unexpectedCaptures.map((r) => ({
          refundId: r.id,
          bookingId: r.bookingId,
          reference: r.booking.reference,
          amountPaise: r.amountPaise,
          status: r.status,
          lastError: r.lastError,
          createdAt: r.createdAt,
        })),
        chargebacks: chargebacks.map((d) => ({
          id: d.id,
          bookingId: d.bookingId,
          reference: d.booking?.reference ?? null,
          amountPaise: d.amountPaise,
          reasonCode: d.reasonCode,
          status: d.status,
          createdAt: d.createdAt,
        })),
        authorizations: authorizations.map((p) => ({
          bookingId: p.bookingId,
          reference: p.booking.reference,
          amountPaise: p.amountPaise,
          captureAttempts: p.captureAttempts,
          lastCaptureError: p.lastCaptureError,
          updatedAt: p.updatedAt,
        })),
        failedEvents,
      };
    },

    async timeline(bookingId) {
      const [payment, refunds, payout, disputes] = await Promise.all([
        db.payment.findUnique({
          where: { bookingId },
          select: {
            status: true,
            provider: true,
            amountPaise: true,
            refundedPaise: true,
            captureAttempts: true,
            lastCaptureError: true,
            lastReconciledAt: true,
          },
        }),
        db.refund.findMany({ where: { bookingId }, select: { id: true } }),
        db.payout.findUnique({ where: { bookingId }, select: { id: true } }),
        db.paymentDispute.findMany({
          where: { bookingId },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, amountPaise: true, reasonCode: true, createdAt: true },
        }),
      ]);
      const entityIds = [
        bookingId,
        ...refunds.map((r) => r.id),
        ...(payout ? [payout.id] : []),
        ...disputes.map((d) => d.id),
      ];
      const events = await db.auditLog.findMany({
        where: {
          entityId: { in: entityIds },
          OR: MONEY_ACTIONS.map((prefix) => ({ action: { startsWith: prefix } })),
        },
        orderBy: { id: "asc" },
        take: 200,
        select: { id: true, createdAt: true, action: true, actorRole: true, after: true, reason: true },
      });
      return {
        payment,
        chargebacks: disputes.map((d) => ({
          id: d.id,
          status: d.status,
          amountPaise: d.amountPaise,
          reasonCode: d.reasonCode,
          at: d.createdAt,
        })),
        events: events.map((e) => ({
          id: e.id,
          at: e.createdAt,
          action: e.action,
          actorRole: e.actorRole,
          detail:
            e.after && typeof e.after === "object" && !Array.isArray(e.after)
              ? (e.after as Record<string, unknown>)
              : null,
          reason: e.reason,
        })),
      };
    },
  };
}
