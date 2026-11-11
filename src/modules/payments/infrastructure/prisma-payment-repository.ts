import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/infrastructure/prisma";
import type { PaymentRepository } from "../application/payments";
import type { ProviderId } from "../domain/payment-provider";

/** Strips anything that could identify the payer before a webhook payload is stored. */
function redact(payload: unknown): Prisma.InputJsonValue {
  const json = JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>;
  for (const key of ["email", "contact", "vpa", "card", "bank", "wallet", "prefill"]) delete json[key];
  return json as Prisma.InputJsonValue;
}

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

    findByOrder: (provider, providerOrderId) =>
      db.payment.findUnique({
        where: { provider_providerOrderId: { provider, providerOrderId } },
        select: { id: true, bookingId: true, status: true, amountPaise: true },
      }),

    async orderForBooking(bookingId) {
      const p = await db.payment.findUnique({
        where: { bookingId },
        select: { provider: true, providerOrderId: true },
      });
      return p?.providerOrderId
        ? { provider: p.provider as ProviderId, providerOrderId: p.providerOrderId }
        : null;
    },

    async recordAuthorized(paymentId, providerPaymentId) {
      await db.payment.updateMany({
        where: { id: paymentId, status: "CREATED" },
        data: { status: "AUTHORIZED", providerPaymentId },
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
          SELECT r.id, r.amount_paise, r.attempts, p.provider_payment_id, p.provider
          FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE r.status = 'PENDING' AND p.provider_payment_id IS NOT NULL
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
      await db.refund.update({
        where: { id },
        data: {
          providerRefundId,
          status: processed ? "PROCESSED" : "INITIATED",
          ...(processed ? { processedAt: new Date() } : {}),
        },
      });
    },

    async failRefundAttempt(id, error, giveUp) {
      await db.refund.update({
        where: { id },
        data: { status: giveUp ? "FAILED" : "PENDING", lastError: error.slice(0, 500) },
      });
    },

    async markRefundByProviderId(providerRefundId, status) {
      await db.refund.updateMany({
        where: { providerRefundId, status: { not: "PROCESSED" } },
        data: { status, ...(status === "PROCESSED" ? { processedAt: new Date() } : {}) },
      });
    },
  };
}
