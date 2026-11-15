import "server-only";
import Razorpay from "razorpay";
import type {
  CreateOrderInput,
  PaymentProvider,
  ProviderEvent,
  ProviderPayment,
  ProviderPaymentStatus,
  ProviderRefund,
  WebhookParseResult,
} from "../domain/payment-provider";
import { PaymentProviderError } from "../domain/payment-provider";
import { checkoutSignature, hmacSha256Hex, signaturesMatch } from "../domain/signatures";

/**
 * Razorpay adapter (test mode only — env.ts rejects anything but rzp_test_ keys). Implements the
 * documented Orders (manual capture) → Checkout → signed callback → capture, signed webhooks, refunds and
 * dispute events. Never exercised against Razorpay: no credentials exist yet. The request builder and the
 * webhook parsing are unit-tested; the SDK calls are typed against razorpay@2.9.8.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

type RzpRefund = { id: string; status: string };

type RzpPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  method?: string;
  error_code?: string;
  error_description?: string;
};

const STATUS: Record<string, ProviderPaymentStatus> = {
  created: "CREATED",
  authorized: "AUTHORIZED",
  captured: "CAPTURED",
  // Captured and then returned in full: never applicable to a booking (audit L9).
  refunded: "REFUNDED",
  failed: "FAILED",
};

function toPayment(p: RzpPayment): ProviderPayment {
  return {
    providerPaymentId: p.id,
    providerOrderId: p.order_id,
    status: STATUS[p.status] ?? "CREATED",
    amountPaise: p.amount,
    currency: p.currency,
    method: p.method ?? null,
    ...(p.error_code ? { failure: { code: p.error_code, description: p.error_description ?? "" } } : {}),
  };
}

/**
 * How long an authorised payment can still be captured. It covers the 12-hour payment window plus time for
 * a retry; anything Peti does not capture by then is returned to the payer by Razorpay automatically.
 */
export const MANUAL_CAPTURE_WINDOW_MINUTES = 24 * 60;

/**
 * The Orders API request (pure, so it can be tested without the SDK). Capture is manual (ADR-006): the
 * order-level setting overrides the dashboard, so a second or wrong-amount payment is never captured.
 */
export function buildOrderRequest(input: CreateOrderInput) {
  return {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.reference,
    notes: { ...input.notes },
    payment: {
      capture: "manual" as const,
      capture_options: {
        manual_expiry_period: MANUAL_CAPTURE_WINDOW_MINUTES,
        refund_speed: "normal" as const,
      },
    },
  };
}

const REFUND_STATUS: Record<string, ProviderRefund["status"]> = {
  processed: "PROCESSED",
  failed: "FAILED",
};
const toRefund = (r: { id: string; status: string }): ProviderRefund => ({
  providerRefundId: r.id,
  status: REFUND_STATUS[r.status] ?? "PENDING",
});

const DISPUTE_EVENTS: Record<string, Extract<ProviderEvent, { type: `DISPUTE_${string}` }>["type"]> = {
  "payment.dispute.created": "DISPUTE_OPENED",
  "payment.dispute.won": "DISPUTE_WON",
  "payment.dispute.lost": "DISPUTE_LOST",
  "payment.dispute.closed": "DISPUTE_CLOSED",
};

/** Pure parsing and verification, separated from the SDK so it can be unit-tested. */
export function parseRazorpayWebhook(
  rawBody: string,
  headers: Readonly<Record<string, string | undefined>>,
  webhookSecret: string,
): WebhookParseResult {
  if (!signaturesMatch(hmacSha256Hex(rawBody, webhookSecret), headers["x-razorpay-signature"])) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  try {
    const body = JSON.parse(rawBody) as {
      event: string;
      payload: {
        payment?: { entity: RzpPayment };
        refund?: {
          entity: { id: string; payment_id: string; amount: number; notes?: Record<string, string> | [] };
        };
        dispute?: {
          entity: { id: string; payment_id: string; amount: number; reason_code?: string };
        };
      };
    };
    const eventId = headers["x-razorpay-event-id"];
    if (!eventId) return { ok: false, reason: "MALFORMED" };
    const payment = body.payload.payment?.entity;
    const refund = body.payload.refund?.entity;
    const dispute = body.payload.dispute?.entity;
    const base = { eventId, providerEventType: body.event };
    if ((body.event === "payment.captured" || body.event === "order.paid") && payment) {
      return {
        ok: true,
        event: {
          ...base,
          type: "PAYMENT_CAPTURED",
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          amountPaise: payment.amount,
          currency: payment.currency,
          method: payment.method ?? null,
        },
      };
    }
    if (body.event === "payment.authorized" && payment) {
      return {
        ok: true,
        event: {
          ...base,
          type: "PAYMENT_AUTHORIZED",
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          amountPaise: payment.amount,
          currency: payment.currency,
          method: payment.method ?? null,
        },
      };
    }
    if (body.event === "payment.failed" && payment) {
      return {
        ok: true,
        event: {
          ...base,
          type: "PAYMENT_FAILED",
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          failure: { code: payment.error_code ?? "", description: payment.error_description ?? "" },
        },
      };
    }
    if ((body.event === "refund.processed" || body.event === "refund.failed") && refund) {
      return {
        ok: true,
        event: {
          ...base,
          type: body.event === "refund.processed" ? "REFUND_PROCESSED" : "REFUND_FAILED",
          providerRefundId: refund.id,
          providerPaymentId: refund.payment_id,
          amountPaise: refund.amount,
          // Matching by our reference settles a refund whose provider id was never stored (audit S-06).
          reference:
            refund.notes && !Array.isArray(refund.notes) && typeof refund.notes.reference === "string"
              ? refund.notes.reference
              : null,
        },
      };
    }
    const disputeType = DISPUTE_EVENTS[body.event];
    if (disputeType && dispute) {
      return {
        ok: true,
        event: {
          ...base,
          type: disputeType,
          providerDisputeId: dispute.id,
          providerPaymentId: dispute.payment_id,
          amountPaise: dispute.amount,
          reasonCode: dispute.reason_code ?? null,
        },
      };
    }
    return { ok: true, event: { ...base, type: "IGNORED" } };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}

export function verifyRazorpayCallback(
  params: Readonly<Record<string, string | undefined>>,
  keySecret: string,
) {
  const orderId = params.razorpay_order_id;
  const paymentId = params.razorpay_payment_id;
  if (!orderId || !paymentId || !params.razorpay_signature)
    return { ok: false as const, reason: "MISSING_FIELDS" as const };
  return signaturesMatch(checkoutSignature(orderId, paymentId, keySecret), params.razorpay_signature)
    ? { ok: true as const, providerOrderId: orderId, providerPaymentId: paymentId }
    : { ok: false as const, reason: "BAD_SIGNATURE" as const };
}

export function razorpayProvider(config: RazorpayConfig): PaymentProvider {
  const client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
  const call = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      throw new PaymentProviderError(
        status && status < 500 ? "REJECTED" : "TRANSIENT",
        "Razorpay request failed",
      );
    }
  };

  return {
    id: "razorpay",

    async createOrder(input) {
      // The SDK's type marks automatic_expiry_period as required even for manual capture; the API does not.
      const body = buildOrderRequest(input) as unknown as Parameters<typeof client.orders.create>[0];
      const order = await call(() => client.orders.create(body));
      return { providerOrderId: order.id };
    },

    checkoutSession(providerOrderId, amountPaise, ctx) {
      return {
        mode: "CLIENT_SDK",
        scriptUrl: "https://checkout.razorpay.com/v1/checkout.js",
        publicConfig: {
          key: config.keyId,
          order_id: providerOrderId,
          amount: amountPaise,
          currency: "INR",
          name: "Peti",
          description: ctx.description,
          callback_url: ctx.callbackUrl,
          redirect: true,
          prefill: ctx.prefill ?? {},
          theme: { color: "#6b1f2a" },
        },
      };
    },

    verifyCallback: (params) => verifyRazorpayCallback(params, config.keySecret),
    parseWebhook: (rawBody, headers) => parseRazorpayWebhook(rawBody, headers, config.webhookSecret),

    async fetchPayment(providerPaymentId) {
      return toPayment((await call(() => client.payments.fetch(providerPaymentId))) as unknown as RzpPayment);
    },

    async listOrderPayments(providerOrderId) {
      const list = (await call(() => client.orders.fetchPayments(providerOrderId))) as unknown as {
        items: RzpPayment[];
      };
      return list.items.map(toPayment);
    },

    async capturePayment(providerPaymentId, amountPaise) {
      return toPayment(
        (await call(() =>
          client.payments.capture(providerPaymentId, amountPaise, "INR"),
        )) as unknown as RzpPayment,
      );
    },

    async fetchRefund(providerRefundId) {
      return toRefund((await call(() => client.refunds.fetch(providerRefundId))) as unknown as RzpRefund);
    },

    async createRefund(input) {
      // Idempotency: look for an earlier refund carrying our reference before creating a new one. A failed
      // one does not count, so an administrator's retry creates a fresh refund instead of reusing the failure.
      const existing = (await call(() =>
        client.payments.fetchMultipleRefund(input.providerPaymentId),
      )) as unknown as {
        items: Array<{ id: string; status: string; notes?: Record<string, string> }>;
      };
      const match = existing.items.find(
        (r) => r.notes?.reference === input.reference && r.status !== "failed",
      );
      const refund =
        match ??
        ((await call(() =>
          client.payments.refund(input.providerPaymentId, {
            amount: input.amountPaise,
            notes: { reference: input.reference },
          }),
        )) as unknown as { id: string; status: string });
      return toRefund(refund);
    },
  };
}
