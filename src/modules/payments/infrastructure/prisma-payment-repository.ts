import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import type { Db } from "@/shared/infrastructure/prisma";
import type { PaymentRef, PaymentRepository } from "../application/payments";
import type { ProviderId } from "../domain/payment-provider";

/** Strips anything that could identify the payer before a webhook payload is stored. */
function redact(payload: unknown): Prisma.InputJsonValue {
  const json = JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>;
  for (const key of ["email", "contact", "vpa", "card", "bank", "wallet", "prefill"]) delete json[key];
  return json as Prisma.InputJsonValue;
}

/**
 * Reconciliation covers an order for 6 days: longer than Razorpay keeps an uncaptured authorisation (our
 * manual-capture window is 24 hours, the maximum 5 days), so nothing can be captured on it afterwards.
 */
const RECONCILE_FOR_DAYS = 6;
const RECONCILE_EVERY_MINUTES = 60;
/** An authorisation whose capture failed is retried sooner. */
const RECONCILE_AUTHORIZED_EVERY_MINUTES = 15;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_FAILED = "The payment provider reported the refund as failed.";

const REF = {
  id: true,
  bookingId: true,
  provider: true,
  status: true,
  amountPaise: true,
  providerOrderId: true,
  providerPaymentId: true,
} as const;

const toRef = (p: {
  id: string;
  bookingId: string;
  provider: string;
  status: string;
  amountPaise: number;
  providerOrderId: string | null;
  providerPaymentId: string | null;
}): PaymentRef => ({ ...p, provider: p.provider as ProviderId });

export function prismaPaymentRepository(db: Db): PaymentRepository {
  return {
    async ensurePayment(bookingId, provider, amountPaise) {
      const existing = await db.payment.findUnique({ where: { bookingId } });
      if (existing) return existing;
      try {
        return await db.payment.create({ data: { bookingId, provider, amountPaise } });
      } catch {
        // Two tabs started checkout at once: the unique booking_id lets exactly one insert win.
        return db.payment.findUniqueOrThrow({ where: { bookingId } });
      }
    },

    async setOrderId(paymentId, providerOrderId) {
      await db.payment.update({ where: { id: paymentId }, data: { providerOrderId } });
    },

    async findByOrder(provider, providerOrderId) {
      const p = await db.payment.findUnique({
        where: { provider_providerOrderId: { provider, providerOrderId } },
        select: REF,
      });
      return p ? toRef(p) : null;
    },

    async findForBooking(bookingId) {
      const p = await db.payment.findUnique({ where: { bookingId }, select: REF });
      return p ? toRef(p) : null;
    },

    async dueForReconciliation(provider, limit) {
      // Database time on purpose: this is an operational throttle, independent of the application clock.
      const rows = await db.$queryRaw<
        Array<{
          id: string;
          booking_id: string;
          provider: string;
          status: string;
          amount_paise: number;
          provider_order_id: string | null;
          provider_payment_id: string | null;
        }>
      >`
        SELECT id, booking_id, provider, status::text AS status, amount_paise, provider_order_id,
               provider_payment_id
        FROM payments
        WHERE provider = ${provider} AND provider_order_id IS NOT NULL
          AND created_at > now() - make_interval(days => ${RECONCILE_FOR_DAYS})
          AND COALESCE(last_reconciled_at, created_at) < now() - CASE WHEN status = 'AUTHORIZED'
                THEN make_interval(mins => ${RECONCILE_AUTHORIZED_EVERY_MINUTES})
                ELSE make_interval(mins => ${RECONCILE_EVERY_MINUTES}) END
        ORDER BY COALESCE(last_reconciled_at, created_at)
        LIMIT ${limit}`;
      return rows.map((r) =>
        toRef({
          id: r.id,
          bookingId: r.booking_id,
          provider: r.provider,
          status: r.status,
          amountPaise: r.amount_paise,
          providerOrderId: r.provider_order_id,
          providerPaymentId: r.provider_payment_id,
        }),
      );
    },

    async markReconciled(paymentId) {
      await db.$executeRaw`UPDATE payments SET last_reconciled_at = now() WHERE id = ${paymentId}::uuid`;
    },

    async recordCaptureFailure(paymentId, error) {
      await db.payment.update({
        where: { id: paymentId },
        data: { captureAttempts: { increment: 1 }, lastCaptureError: error.slice(0, 500) },
      });
    },

    async releaseClaim(paymentId, providerPaymentId, error) {
      await db.payment.updateMany({
        where: { id: paymentId, status: "AUTHORIZED", providerPaymentId },
        data: {
          status: "CREATED",
          providerPaymentId: null,
          captureAttempts: { increment: 1 },
          lastCaptureError: error.slice(0, 500),
        },
      });
    },

    async recordFailure(paymentId, code, reason) {
      await db.payment.updateMany({
        where: { id: paymentId, status: { not: "CAPTURED" } },
        data: { lastFailureCode: code ?? null, lastFailureReason: reason ?? null },
      });
    },

    async inboxInsert(provider, eventId, eventType, payload) {
      const inserted = await db.$queryRaw<Array<{ id: number }>>`
        INSERT INTO provider_events (provider, provider_event_id, event_type, payload, status)
        VALUES (${provider}, ${eventId}, ${eventType}, ${JSON.stringify(redact(payload))}::jsonb, 'RECEIVED')
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id`;
      if (inserted[0]) return { id: inserted[0].id, isNew: true, status: "RECEIVED" };
      const existing = await db.providerEvent.findUniqueOrThrow({
        where: { provider_providerEventId: { provider, providerEventId: eventId } },
        select: { id: true, status: true },
      });
      return { id: existing.id, isNew: false, status: existing.status };
    },

    async inboxMark(id, status, error) {
      await db.providerEvent.update({
        where: { id },
        data: {
          status,
          attempts: { increment: 1 },
          lastError: error ?? null,
          ...(status !== "FAILED" ? { processedAt: new Date() } : {}),
        },
      });
    },

    async claimRefunds(limit) {
      return db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            amount_paise: number;
            attempts: number;
            provider_payment_id: string;
            provider: string;
          }>
        >`
          -- A reversal refunds the stray provider payment it names, never the booking's own payment.
          SELECT r.id, r.amount_paise, r.attempts, p.provider,
                 COALESCE(r.reversed_provider_payment_id, p.provider_payment_id) AS provider_payment_id
          FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE COALESCE(r.reversed_provider_payment_id, p.provider_payment_id) IS NOT NULL
            AND (r.status = 'PENDING'
                 -- A worker that crashed between claiming and recording the provider id leaves the row
                 -- INITIATED; reclaim it after a lease. Safe because createRefund is idempotent on our id.
                 OR (r.status = 'INITIATED' AND r.provider_refund_id IS NULL AND r.initiated_at < now() - interval '15 minutes'))
          ORDER BY r.created_at
          LIMIT ${limit}
          FOR UPDATE OF r SKIP LOCKED`;
        if (rows.length) {
          await tx.refund.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { status: "INITIATED", initiatedAt: new Date(), attempts: { increment: 1 } },
          });
        }
        return rows.map((r) => ({
          id: r.id,
          amountPaise: r.amount_paise,
          attempts: r.attempts,
          providerPaymentId: r.provider_payment_id,
          provider: r.provider as ProviderId,
        }));
      });
    },

    async completeRefund(id, providerRefundId, processed) {
      await db.$transaction(async (tx) => {
        // Compare-and-swap on INITIATED: a webhook that already settled the refund is never undone.
        const updated = await tx.refund.updateMany({
          where: { id, status: "INITIATED" },
          data: {
            providerRefundId,
            status: processed ? "PROCESSED" : "INITIATED",
            ...(processed ? { processedAt: new Date() } : {}),
          },
        });
        if (updated.count !== 1) return;
        await prismaAuditLog(tx).record({
          actorUserId: null,
          actorRole: "SYSTEM",
          action: processed ? "refund.processed" : "refund.sent",
          entityType: "refund",
          entityId: id,
          after: { providerRefundId, source: "dispatch" },
        });
      });
    },

    async failRefundAttempt(id, error, giveUp) {
      await db.$transaction(async (tx) => {
        const updated = await tx.refund.updateMany({
          where: { id, status: "INITIATED" },
          data: { status: giveUp ? "FAILED" : "PENDING", lastError: error.slice(0, 500) },
        });
        if (updated.count !== 1 || !giveUp) return;
        await prismaAuditLog(tx).record({
          actorUserId: null,
          actorRole: "SYSTEM",
          action: "refund.failed",
          entityType: "refund",
          entityId: id,
          after: { error: error.slice(0, 500), source: "dispatch" },
        });
      });
    },

    async settleRefund(match, status, source) {
      return db.$transaction(async (tx) => {
        const unsettled = { notIn: ["PROCESSED" as const, status] };
        const row = await tx.refund.findFirst({
          where: {
            status: unsettled,
            OR: [
              { providerRefundId: match.providerRefundId },
              // S-06: a worker that sent the refund but died before storing the provider id.
              ...(match.reference && UUID.test(match.reference)
                ? [{ id: match.reference, providerRefundId: null, status: "INITIATED" as const }]
                : []),
            ],
          },
          select: { id: true, providerRefundId: true, amountPaise: true, bookingId: true },
        });
        if (!row) return false;
        const updated = await tx.refund.updateMany({
          where: { id: row.id, status: unsettled },
          data: {
            status,
            providerRefundId: row.providerRefundId ?? match.providerRefundId,
            ...(status === "PROCESSED" ? { processedAt: new Date() } : { lastError: PROVIDER_FAILED }),
          },
        });
        if (updated.count !== 1) return false;
        await prismaAuditLog(tx).record({
          actorUserId: null,
          actorRole: "SYSTEM",
          action: status === "PROCESSED" ? "refund.processed" : "refund.failed",
          entityType: "refund",
          entityId: row.id,
          after: {
            providerRefundId: match.providerRefundId,
            bookingId: row.bookingId,
            amountPaise: row.amountPaise,
            source,
          },
        });
        return true;
      });
    },

    async refundsAwaitingProvider(checkedBefore, limit) {
      const rows = await db.refund.findMany({
        where: { status: "INITIATED", providerRefundId: { not: null }, updatedAt: { lt: checkedBefore } },
        orderBy: { updatedAt: "asc" },
        take: limit,
        select: { id: true, providerRefundId: true },
      });
      return rows.map((r) => ({ id: r.id, providerRefundId: r.providerRefundId! }));
    },

    async recordDispute(provider, d) {
      return db.$transaction(async (tx) => {
        // The disputed payment is the booking's own payment, or a stray capture Peti reversed.
        const payment = await tx.payment.findFirst({
          where: { provider, providerPaymentId: d.providerPaymentId },
          select: { id: true, bookingId: true },
        });
        const reversal = payment
          ? null
          : await tx.refund.findFirst({
              where: { reversedProviderPaymentId: d.providerPaymentId },
              select: { paymentId: true, bookingId: true },
            });
        const link = payment
          ? { paymentId: payment.id, bookingId: payment.bookingId }
          : reversal
            ? { paymentId: reversal.paymentId, bookingId: reversal.bookingId }
            : { paymentId: null, bookingId: null };

        const key = { provider_providerDisputeId: { provider, providerDisputeId: d.providerDisputeId } };
        const find = () => tx.paymentDispute.findUnique({ where: key, select: { id: true, status: true } });
        let existing = await find();
        let id: string | null = null;
        if (!existing) {
          // ON CONFLICT, not a caught error: a failed insert would abort the whole transaction.
          const created = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO payment_disputes (provider, provider_dispute_id, provider_payment_id, payment_id,
                                          booking_id, status, amount_paise, reason_code, updated_at)
            VALUES (${provider}, ${d.providerDisputeId}, ${d.providerPaymentId}, ${link.paymentId}::uuid,
                    ${link.bookingId}::uuid, ${d.status}::"PaymentDisputeStatus", ${d.amountPaise},
                    ${d.reasonCode}, now())
            ON CONFLICT (provider, provider_dispute_id) DO NOTHING
            RETURNING id`;
          id = created[0]?.id ?? null;
          // A concurrent delivery recorded it first: apply this event to that row instead.
          if (!id) existing = await find();
        }
        if (!id) {
          if (!existing) return false;
          // Never back to OPEN: events can arrive out of order, and a resolution is final.
          if (existing.status === d.status || d.status === "OPEN") return false;
          const updated = await tx.paymentDispute.updateMany({
            where: { id: existing.id, status: existing.status },
            data: { status: d.status, amountPaise: d.amountPaise, reasonCode: d.reasonCode },
          });
          if (updated.count !== 1) return false;
          id = existing.id;
        }
        await prismaAuditLog(tx).record({
          actorUserId: null,
          actorRole: "SYSTEM",
          action: "dispute." + d.status.toLowerCase(),
          entityType: "payment_dispute",
          entityId: id,
          before: existing ? { status: existing.status } : undefined,
          after: {
            status: d.status,
            providerDisputeId: d.providerDisputeId,
            providerPaymentId: d.providerPaymentId,
            bookingId: link.bookingId,
            amountPaise: d.amountPaise,
            reasonCode: d.reasonCode,
          },
        });
        return true;
      });
    },

    async markRefundChecked(id) {
      // Moves the refund to the back of the queue, so pending refunds take turns being checked.
      await db.refund.updateMany({ where: { id, status: "INITIATED" }, data: { updatedAt: new Date() } });
    },
  };
}
