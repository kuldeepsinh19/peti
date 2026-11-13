import "server-only";
import Razorpay from "razorpay";
import type {
  PaymentProvider,
  ProviderPayment,
  ProviderPaymentStatus,
  WebhookParseResult,
} from "../domain/payment-provider";
import { PaymentProviderError } from "../domain/payment-provider";
import { checkoutSignature, hmacSha256Hex, signaturesMatch } from "../domain/signatures";

/**
 * Razorpay adapter (test mode only — env.ts rejects anything but rzp_test_ keys). Implements the
 * documented Orders → Checkout → signed callback and signed webhook flow. Not exercised against Razorpay
 * in CI; signature handling is unit-tested with computed vectors.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

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
  refunded: "CAPTURED",
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
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
    };
    const eventId = headers["x-razorpay-event-id"];
    if (!eventId) return { ok: false, reason: "MALFORMED" };
    const payment = body.payload.payment?.entity;
    const refund = body.payload.refund?.entity;
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
      const order = await call(() =>
        client.orders.create({
          amount: input.amountPaise,
          currency: "INR",
          receipt: input.reference,
          notes: { ...input.notes },
        }),
      );
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

    async findCapturedPaymentForOrder(providerOrderId) {
      const list = (await call(() => client.orders.fetchPayments(providerOrderId))) as unknown as {
        items: RzpPayment[];
      };
      const captured = list.items.find((p) => p.status === "captured");
      return captured ? toPayment(captured) : null;
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
      return {
        providerRefundId: refund.id,
        status:
          refund.status === "processed" ? "PROCESSED" : refund.status === "failed" ? "FAILED" : "PENDING",
      };
    },
  };
}
