/**
 * Provider-neutral payment port (ADR-005, ADR-006). Nothing outside an adapter sees provider SDK types.
 * Amounts are integer paise; currency is INR.
 *
 * Capture is explicit (ADR-006): orders are created for manual capture, so an authorised payment only
 * becomes money once Peti captures it. Peti captures exactly one payment per booking — the one it can
 * apply — and leaves every other authorisation uncaptured, which the provider returns to the payer.
 */
export type ProviderId = "sandbox" | "razorpay";

export interface CreateOrderInput {
  /** Our payments.id — sent as the provider's receipt/reference. */
  reference: string;
  amountPaise: number;
  /** Opaque internal ids only; never personal data. */
  notes: Readonly<Record<string, string>>;
}

export type CheckoutSession =
  | { mode: "REDIRECT"; url: string }
  | { mode: "CLIENT_SDK"; scriptUrl: string; publicConfig: Readonly<Record<string, unknown>> };

export interface CheckoutContext {
  callbackUrl: string;
  cancelUrl: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export type CallbackVerification =
  | { ok: true; providerOrderId: string; providerPaymentId: string }
  | { ok: false; reason: "MISSING_FIELDS" | "BAD_SIGNATURE" };

/**
 * REFUNDED: captured and since returned to the payer in full (it can never be applied to a booking).
 */
export type ProviderPaymentStatus = "CREATED" | "AUTHORIZED" | "CAPTURED" | "REFUNDED" | "FAILED";

export interface ProviderPayment {
  providerPaymentId: string;
  providerOrderId: string;
  status: ProviderPaymentStatus;
  amountPaise: number;
  currency: string;
  method: string | null;
  failure?: { code?: string; description?: string };
}

export type ProviderEvent =
  | {
      eventId: string;
      providerEventType: string;
      type: "PAYMENT_CAPTURED" | "PAYMENT_AUTHORIZED";
      providerOrderId: string;
      providerPaymentId: string;
      amountPaise: number;
      currency: string;
      method: string | null;
    }
  | {
      eventId: string;
      providerEventType: string;
      type: "PAYMENT_FAILED";
      providerOrderId: string;
      providerPaymentId: string;
      failure: { code?: string; description?: string };
    }
  | {
      eventId: string;
      providerEventType: string;
      type: "REFUND_PROCESSED" | "REFUND_FAILED";
      providerRefundId: string;
      providerPaymentId: string;
      amountPaise: number;
      /** Our refunds.id, echoed back from the refund's notes, when present. */
      reference: string | null;
    }
  | {
      eventId: string;
      providerEventType: string;
      type: "DISPUTE_OPENED" | "DISPUTE_WON" | "DISPUTE_LOST" | "DISPUTE_CLOSED";
      providerDisputeId: string;
      providerPaymentId: string;
      amountPaise: number;
      reasonCode: string | null;
    }
  | { eventId: string; providerEventType: string; type: "IGNORED" };

export type WebhookParseResult =
  { ok: true; event: ProviderEvent } | { ok: false; reason: "BAD_SIGNATURE" | "MALFORMED" };

export interface ProviderRefund {
  providerRefundId: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Creates an order for manual capture (nothing is captured until `capturePayment`). */
  createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }>;
  /** Pure: no network. */
  checkoutSession(providerOrderId: string, amountPaise: number, ctx: CheckoutContext): CheckoutSession;
  /** Pure: verifies the signed fields the checkout posts back (timing-safe). */
  verifyCallback(params: Readonly<Record<string, string | undefined>>): CallbackVerification;
  /** Pure: verifies the signature over the RAW body, then normalises the event. */
  parseWebhook(rawBody: string, headers: Readonly<Record<string, string | undefined>>): WebhookParseResult;
  /** Server-to-server truth about a payment. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;
  /** Every payment attempt made on an order, in any state (used by reconciliation). */
  listOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  /**
   * Captures an authorised payment for its full amount. Throws PaymentProviderError when the provider
   * refuses (for example because it was already captured); callers then re-fetch the payment.
   */
  capturePayment(providerPaymentId: string, amountPaise: number): Promise<ProviderPayment>;
  /** Must be idempotent on `reference` (our refunds.id). */
  createRefund(input: {
    providerPaymentId: string;
    amountPaise: number;
    reference: string;
  }): Promise<ProviderRefund>;
  /** Server-to-server truth about a refund (settles refunds whose webhook never arrived). */
  fetchRefund(providerRefundId: string): Promise<ProviderRefund>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly kind: "TRANSIENT" | "REJECTED" | "MISCONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
