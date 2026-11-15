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
import { PaymentProviderError } from "../domain/payment-provider";
import { checkoutSignature, hmacSha256Hex, signaturesMatch } from "../domain/signatures";

/**
 * Local and test payment provider. It behaves like a hosted checkout with manual capture (ADR-006): the
 * app creates an order, the renter "pays" on /dev/sandbox-checkout, which AUTHORISES a payment and sends an
 * HMAC-signed browser callback and webhook through the same routes and verification code as a real
 * provider; the app then captures the payment it can apply. There is no way to mark a booking as paid
 * without going through those signed messages and the capture.
 *
 * It is only registered when APP_ENV is local, test or demo, and requires secrets with no defaults.
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
  status: "authorized" | "captured" | "failed" | "refunded";
  method: string;
}
interface RefundData {
  paymentId: string;
  amountPaise: number;
  reference: string;
}

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

/**
 * - pay*: the renter authorises one payment (the normal path, with callback and/or webhook);
 * - pay-twice: two payments are authorised on the same order (a double tap, or a retried UPI request);
 * - pay-captured: a payment is captured without Peti (from the provider dashboard, or auto-capture left on);
 * - pay-wrong-amount: a payment for a different amount than the order (should never happen; tests it);
 * - fail: the payment fails.
 */
export type SandboxOutcome =
  | "pay"
  | "pay-webhook-only"
  | "pay-callback-only"
  | "pay-duplicate-webhook"
  | "pay-twice"
  | "pay-captured"
  | "pay-wrong-amount"
  | "fail";

export interface SandboxSimulation {
  callback: Record<string, string> | null;
  webhooks: Array<{ body: string; headers: Record<string, string> }>;
  paymentIds: string[];
}

const STATUS: Record<PaymentData["status"], ProviderPayment["status"]> = {
  authorized: "AUTHORIZED",
  captured: "CAPTURED",
  failed: "FAILED",
  refunded: "REFUNDED",
};

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
    status: STATUS[p.status],
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
          payload: Record<string, string | number | null>;
        };
        const p = event.payload;
        const base = { eventId: event.id, providerEventType: event.type };
        switch (event.type) {
          case "payment.authorized":
          case "payment.captured":
            return {
              ok: true,
              event: {
                ...base,
                type: event.type === "payment.captured" ? "PAYMENT_CAPTURED" : "PAYMENT_AUTHORIZED",
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
                ...base,
                type: "PAYMENT_FAILED",
                providerOrderId: String(p.orderId),
                providerPaymentId: String(p.paymentId),
                failure: { code: "SANDBOX_DECLINED", description: "Declined in the sandbox checkout" },
              },
            };
          case "refund.processed":
          case "refund.failed":
            return {
              ok: true,
              event: {
                ...base,
                type: event.type === "refund.processed" ? "REFUND_PROCESSED" : "REFUND_FAILED",
                providerRefundId: String(p.refundId),
                providerPaymentId: String(p.paymentId),
                amountPaise: Number(p.amountPaise),
                reference: p.reference ? String(p.reference) : null,
              },
            };
          case "payment.dispute.created":
          case "payment.dispute.won":
          case "payment.dispute.lost":
          case "payment.dispute.closed":
            return {
              ok: true,
              event: {
                ...base,
                type: (
                  {
                    "payment.dispute.created": "DISPUTE_OPENED",
                    "payment.dispute.won": "DISPUTE_WON",
                    "payment.dispute.lost": "DISPUTE_LOST",
                    "payment.dispute.closed": "DISPUTE_CLOSED",
                  } as const
                )[event.type],
                providerDisputeId: String(p.disputeId),
                providerPaymentId: String(p.paymentId),
                amountPaise: Number(p.amountPaise),
                reasonCode: p.reasonCode ? String(p.reasonCode) : null,
              },
            };
          default:
            return { ok: true, event: { ...base, type: "IGNORED" } };
        }
      } catch {
        return { ok: false, reason: "MALFORMED" };
      }
    },

    async fetchPayment(providerPaymentId) {
      const p = await get<PaymentData>(providerPaymentId, "payment");
      if (!p) throw new PaymentProviderError("REJECTED", "Unknown sandbox payment");
      return toPayment(providerPaymentId, p);
    },

    async listOrderPayments(providerOrderId) {
      const rows = await db.sandboxProviderObject.findMany({ where: { kind: "payment" } });
      return rows
        .filter((r) => (r.data as unknown as PaymentData).orderId === providerOrderId)
        .map((r) => toPayment(r.id, r.data as unknown as PaymentData));
    },

    async capturePayment(providerPaymentId, amountPaise) {
      const p = await get<PaymentData>(providerPaymentId, "payment");
      if (!p) throw new PaymentProviderError("REJECTED", "Unknown sandbox payment");
      // Like the real provider: only an authorised payment, for its exact amount, can be captured once.
      if (p.status !== "authorized") throw new PaymentProviderError("REJECTED", `Payment is ${p.status}`);
      if (p.amountPaise !== amountPaise)
        throw new PaymentProviderError("REJECTED", "Capture amount mismatch");
      const captured: PaymentData = { ...p, status: "captured" };
      await put(providerPaymentId, "payment", captured);
      const order = await get<OrderData>(p.orderId, "order");
      if (order) await put(p.orderId, "order", { ...order, status: "paid" } satisfies OrderData);
      return toPayment(providerPaymentId, captured);
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

    async fetchRefund(providerRefundId) {
      const r = await get<RefundData>(providerRefundId, "refund");
      if (!r) throw new PaymentProviderError("REJECTED", "Unknown sandbox refund");
      return { providerRefundId, status: "PROCESSED" };
    },
  };

  async function authorise(orderId: string, amountPaise: number, status: PaymentData["status"]) {
    const paymentId = id("pay_sb");
    await put(paymentId, "payment", { orderId, amountPaise, status, method: "upi" } satisfies PaymentData);
    return paymentId;
  }

  /**
   * What the sandbox checkout page does when the renter clicks an outcome: records the payment(s) on the
   * provider side and returns the signed callback and webhook(s) the provider would send.
   */
  async function simulate(orderId: string, outcome: SandboxOutcome): Promise<SandboxSimulation> {
    const order = await get<OrderData>(orderId, "order");
    if (!order) throw new Error("Unknown sandbox order");
    const callbackFor = (paymentId: string) => ({
      provider_order_id: orderId,
      provider_payment_id: paymentId,
      signature: checkoutSignature(orderId, paymentId, secrets.keySecret),
    });
    const webhookFor = (type: string, paymentId: string, amountPaise: number) =>
      signedWebhook(type, { orderId, paymentId, amountPaise, currency: "INR", method: "upi" });

    if (outcome === "fail") {
      const paymentId = await authorise(orderId, order.amountPaise, "failed");
      return {
        callback: null,
        webhooks: [signedWebhook("payment.failed", { orderId, paymentId })],
        paymentIds: [paymentId],
      };
    }
    if (outcome === "pay-twice") {
      const first = await authorise(orderId, order.amountPaise, "authorized");
      const second = await authorise(orderId, order.amountPaise, "authorized");
      return {
        callback: callbackFor(first),
        webhooks: [
          webhookFor("payment.authorized", first, order.amountPaise),
          webhookFor("payment.authorized", second, order.amountPaise),
        ],
        paymentIds: [first, second],
      };
    }
    if (outcome === "pay-captured") {
      const paymentId = await authorise(orderId, order.amountPaise, "captured");
      await put(orderId, "order", { ...order, status: "paid" } satisfies OrderData);
      return {
        callback: callbackFor(paymentId),
        webhooks: [webhookFor("payment.captured", paymentId, order.amountPaise)],
        paymentIds: [paymentId],
      };
    }
    const amountPaise = outcome === "pay-wrong-amount" ? order.amountPaise - 100 : order.amountPaise;
    const paymentId = await authorise(orderId, amountPaise, "authorized");
    const webhook = webhookFor("payment.authorized", paymentId, amountPaise);
    return {
      callback: outcome === "pay-webhook-only" ? null : callbackFor(paymentId),
      webhooks:
        outcome === "pay-callback-only"
          ? []
          : outcome === "pay-duplicate-webhook"
            ? [webhook, webhook]
            : [webhook],
      paymentIds: [paymentId],
    };
  }

  async function order(orderId: string) {
    return get<OrderData>(orderId, "order");
  }

  /** Test helpers: signed webhooks the real provider would send later (refund outcome, chargebacks). */
  const webhooks = {
    refund: (
      status: "processed" | "failed",
      r: { refundId: string; paymentId: string; amountPaise: number; reference: string | null },
    ) => signedWebhook(`refund.${status}`, r),
    dispute: (
      status: "created" | "won" | "lost" | "closed",
      d: { disputeId: string; paymentId: string; amountPaise: number; reasonCode?: string },
    ) => signedWebhook(`payment.dispute.${status}`, { ...d, reasonCode: d.reasonCode ?? null }),
  };

  return { provider, simulate, order, webhooks };
}

export type SandboxProvider = ReturnType<typeof sandboxProvider>;
