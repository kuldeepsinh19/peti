import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/infrastructure/prisma";
import type {
  CallbackVerification,
  PaymentProvider,
  ProviderPayment,
  ProviderRefund,
  WebhookParseResult,
} from "../domain/payment-provider";
import { checkoutSignature, hmacSha256Hex, signaturesMatch } from "../domain/signatures";

/**
 * Local and test payment provider. It behaves like a hosted checkout: the app creates an order, the
 * renter "pays" on /dev/sandbox-checkout, and the provider then sends an HMAC-signed browser callback and
 * an HMAC-signed webhook through the same routes and verification code as a real provider. There is no
 * way to mark a booking as paid without going through those signed messages.
 *
 * It is only registered when APP_ENV is local or test, and requires secrets with no defaults.
 */
export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";
export const SANDBOX_EVENT_HEADER = "x-sandbox-event-id";

interface OrderData {
  amountPaise: number;
  reference: string;
  status: "created" | "paid";
}
interface PaymentData {
  orderId: string;
  amountPaise: number;
  status: "captured" | "failed";
  method: string;
}
interface RefundData {
  paymentId: string;
  amountPaise: number;
  reference: string;
}

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

export type SandboxOutcome =
  "pay" | "pay-webhook-only" | "pay-callback-only" | "pay-duplicate-webhook" | "fail";

export interface SandboxSimulation {
  callback: Record<string, string> | null;
  webhooks: Array<{ body: string; headers: Record<string, string> }>;
}

export function sandboxProvider(db: Db, secrets: { keySecret: string; webhookSecret: string }) {
  const get = async <T>(objectId: string, kind: string) => {
    const row = await db.sandboxProviderObject.findUnique({ where: { id: objectId } });
    return row && row.kind === kind ? (row.data as unknown as T) : null;
  };
  const put = (objectId: string, kind: string, data: object) =>
    db.sandboxProviderObject.upsert({
      where: { id: objectId },
      create: { id: objectId, kind, data: data as Prisma.InputJsonValue },
      update: { data: data as Prisma.InputJsonValue },
    });

  const toPayment = (paymentId: string, p: PaymentData): ProviderPayment => ({
    providerPaymentId: paymentId,
    providerOrderId: p.orderId,
    status: p.status === "captured" ? "CAPTURED" : "FAILED",
    amountPaise: p.amountPaise,
    currency: "INR",
    method: p.method,
  });

  function signedWebhook(type: string, payload: Record<string, unknown>) {
    const eventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({ id: eventId, type, created_at: Date.now(), payload });
    return {
      body,
      headers: {
        "content-type": "application/json",
        [SANDBOX_EVENT_HEADER]: eventId,
        [SANDBOX_SIGNATURE_HEADER]: hmacSha256Hex(body, secrets.webhookSecret),
      },
    };
  }

  const provider: PaymentProvider = {
    id: "sandbox",

    async createOrder(input) {
      const orderId = id("order_sb");
      await put(orderId, "order", {
        amountPaise: input.amountPaise,
        reference: input.reference,
        status: "created",
      } satisfies OrderData);
      return { providerOrderId: orderId };
    },

    checkoutSession(providerOrderId) {
      return { mode: "REDIRECT", url: `/dev/sandbox-checkout/${providerOrderId}` };
    },

    verifyCallback(params): CallbackVerification {
      const orderId = params.provider_order_id;
      const paymentId = params.provider_payment_id;
      if (!orderId || !paymentId || !params.signature) return { ok: false, reason: "MISSING_FIELDS" };
      const expected = checkoutSignature(orderId, paymentId, secrets.keySecret);
      return signaturesMatch(expected, params.signature)
        ? { ok: true, providerOrderId: orderId, providerPaymentId: paymentId }
        : { ok: false, reason: "BAD_SIGNATURE" };
    },

    parseWebhook(rawBody, headers): WebhookParseResult {
      if (
        !signaturesMatch(hmacSha256Hex(rawBody, secrets.webhookSecret), headers[SANDBOX_SIGNATURE_HEADER])
      ) {
        return { ok: false, reason: "BAD_SIGNATURE" };
      }
      try {
        const event = JSON.parse(rawBody) as {
          id: string;
          type: string;
          payload: Record<string, string | number>;
        };
        const p = event.payload;
        switch (event.type) {
          case "payment.captured":
            return {
              ok: true,
              event: {
                eventId: event.id,
                providerEventType: event.type,
                type: "PAYMENT_CAPTURED",
                providerOrderId: String(p.orderId),
                providerPaymentId: String(p.paymentId),
                amountPaise: Number(p.amountPaise),
                currency: String(p.currency),
                method: String(p.method ?? "upi"),
              },
            };
          case "payment.failed":
            return {
              ok: true,
              event: {
                eventId: event.id,
                providerEventType: event.type,
                type: "PAYMENT_FAILED",
                providerOrderId: String(p.orderId),
                providerPaymentId: String(p.paymentId),
                failure: { code: "SANDBOX_DECLINED", description: "Declined in the sandbox checkout" },
              },
            };
          case "refund.processed":
            return {
              ok: true,
              event: {
                eventId: event.id,
                providerEventType: event.type,
                type: "REFUND_PROCESSED",
                providerRefundId: String(p.refundId),
                providerPaymentId: String(p.paymentId),
                amountPaise: Number(p.amountPaise),
              },
            };
          default:
            return { ok: true, event: { eventId: event.id, providerEventType: event.type, type: "IGNORED" } };
        }
      } catch {
        return { ok: false, reason: "MALFORMED" };
      }
    },

    async fetchPayment(providerPaymentId) {
      const p = await get<PaymentData>(providerPaymentId, "payment");
      if (!p) throw new Error("Unknown sandbox payment");
      return toPayment(providerPaymentId, p);
    },

    async findCapturedPaymentForOrder(providerOrderId) {
      const rows = await db.sandboxProviderObject.findMany({ where: { kind: "payment" } });
      const row = rows.find((r) => {
        const d = r.data as unknown as PaymentData;
        return d.orderId === providerOrderId && d.status === "captured";
      });
      return row ? toPayment(row.id, row.data as unknown as PaymentData) : null;
    },

    async createRefund(input): Promise<ProviderRefund> {
      const existing = await db.sandboxProviderObject.findMany({ where: { kind: "refund" } });
      const match = existing.find((r) => (r.data as unknown as RefundData).reference === input.reference);
      if (match) return { providerRefundId: match.id, status: "PROCESSED" };
      const refundId = id("rfnd_sb");
      await put(refundId, "refund", {
        paymentId: input.providerPaymentId,
        amountPaise: input.amountPaise,
        reference: input.reference,
      } satisfies RefundData);
      return { providerRefundId: refundId, status: "PROCESSED" };
    },
  };

  /**
   * What the sandbox checkout page does when the renter clicks an outcome: records the payment on the
   * provider side and returns the signed callback and webhook(s) the provider would send.
   */
  async function simulate(orderId: string, outcome: SandboxOutcome): Promise<SandboxSimulation> {
    const order = await get<OrderData>(orderId, "order");
    if (!order) throw new Error("Unknown sandbox order");
    const paymentId = id("pay_sb");
    if (outcome === "fail") {
      await put(paymentId, "payment", {
        orderId,
        amountPaise: order.amountPaise,
        status: "failed",
        method: "upi",
      } satisfies PaymentData);
      return { callback: null, webhooks: [signedWebhook("payment.failed", { orderId, paymentId })] };
    }
    await put(paymentId, "payment", {
      orderId,
      amountPaise: order.amountPaise,
      status: "captured",
      method: "upi",
    } satisfies PaymentData);
    await put(orderId, "order", { ...order, status: "paid" } satisfies OrderData);
    const callback = {
      provider_order_id: orderId,
      provider_payment_id: paymentId,
      signature: checkoutSignature(orderId, paymentId, secrets.keySecret),
    };
    const webhook = signedWebhook("payment.captured", {
      orderId,
      paymentId,
      amountPaise: order.amountPaise,
      currency: "INR",
      method: "upi",
    });
    return {
      callback: outcome === "pay-webhook-only" ? null : callback,
      webhooks:
        outcome === "pay-callback-only"
          ? []
          : outcome === "pay-duplicate-webhook"
            ? [webhook, webhook]
            : [webhook],
    };
  }

  async function order(orderId: string) {
    return get<OrderData>(orderId, "order");
  }

  return { provider, simulate, order };
}

export type SandboxProvider = ReturnType<typeof sandboxProvider>;
