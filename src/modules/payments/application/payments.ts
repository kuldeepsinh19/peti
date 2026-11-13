import type { BookingsUseCases, CaptureOutcome } from "@/modules/bookings";
import type { Actor } from "@/shared/application/actor";
import type { AuditLog } from "@/shared/application/audit";
import { requireUser } from "@/shared/application/authorization";
import type { Clock } from "@/shared/domain/clock";
import { MINUTE_MS } from "@/shared/domain/clock";
import { DomainError, NotFoundError, PreconditionError } from "@/shared/domain/errors";
import type { CheckoutSession, PaymentProvider, ProviderEvent, ProviderId } from "../domain/payment-provider";

export interface PaymentRepository {
  ensurePayment(
    bookingId: string,
    provider: ProviderId,
    amountPaise: number,
  ): Promise<{ id: string; status: string; providerOrderId: string | null; provider: string }>;
  setOrderId(paymentId: string, providerOrderId: string): Promise<void>;
  findByOrder(
    provider: ProviderId,
    providerOrderId: string,
  ): Promise<{ id: string; bookingId: string; status: string; amountPaise: number } | null>;
  orderForBooking(bookingId: string): Promise<{ provider: ProviderId; providerOrderId: string } | null>;
  recordAuthorized(paymentId: string, providerPaymentId: string): Promise<void>;
  recordFailure(paymentId: string, code: string | undefined, reason: string | undefined): Promise<void>;
  inboxInsert(
    provider: ProviderId,
    eventId: string,
    eventType: string,
    payload: unknown,
  ): Promise<{ id: number; isNew: boolean; status: string }>;
  inboxMark(id: number, status: "PROCESSED" | "IGNORED" | "FAILED", error?: string): Promise<void>;
  claimRefunds(limit: number): Promise<
    Array<{
      id: string;
      amountPaise: number;
      providerPaymentId: string;
      provider: ProviderId;
      attempts: number;
    }>
  >;
  completeRefund(id: string, providerRefundId: string, processed: boolean): Promise<void>;
  failRefundAttempt(id: string, error: string, giveUp: boolean): Promise<void>;
  markRefundByProviderId(providerRefundId: string, status: "PROCESSED" | "FAILED"): Promise<void>;
}

export interface PaymentsDeps {
  provider: PaymentProvider;
  payments: PaymentRepository;
  bookings: Pick<BookingsUseCases, "detail" | "recordCapturedPayment">;
  clock: Clock;
  appUrl: string;
  audit: AuditLog;
}

export interface CallbackResult {
  bookingId: string | null;
  outcome: CaptureOutcome | "PENDING" | "INVALID";
}

const MAX_REFUND_ATTEMPTS = 5;
const MIN_CHECKOUT_MINUTES = 2;

export function paymentsUseCases(deps: PaymentsDeps) {
  const { provider, payments, bookings, clock, audit } = deps;

  /**
   * Money the provider took that does not fit the booking (a second capture, or a different amount) is
   * never applied automatically and never retried forever: it is recorded for an administrator to refund
   * by hand, and the provider is told the event was received.
   */
  async function flagUnexpectedCapture(error: DomainError, eventId: string) {
    await audit.record({
      actorUserId: null,
      actorRole: "SYSTEM",
      action: "payment.unexpectedCapture",
      entityType: "provider_event",
      entityId: eventId,
      after: { code: error.code, ...(error.details ?? {}) },
      reason: error.message,
    });
  }
  const isUnexpectedCapture = (error: unknown): error is DomainError =>
    error instanceof DomainError && (error.code === "DUPLICATE_CAPTURE" || error.code === "AMOUNT_MISMATCH");

  /** Confirms a capture with the bookings module — the only path to CONFIRMED. */
  async function capture(
    paymentRow: { bookingId: string },
    p: { providerPaymentId: string; amountPaise: number; currency: string; method: string | null },
  ) {
    return bookings.recordCapturedPayment({
      bookingId: paymentRow.bookingId,
      provider: provider.id,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      currency: p.currency,
      method: p.method,
    });
  }

  async function processEvent(event: ProviderEvent): Promise<"PROCESSED" | "IGNORED"> {
    switch (event.type) {
      case "PAYMENT_CAPTURED": {
        const row = await payments.findByOrder(provider.id, event.providerOrderId);
        if (!row) return "IGNORED";
        await capture(row, event);
        return "PROCESSED";
      }
      case "PAYMENT_AUTHORIZED": {
        const row = await payments.findByOrder(provider.id, event.providerOrderId);
        if (!row || row.status !== "CREATED") return "IGNORED";
        await payments.recordAuthorized(row.id, event.providerPaymentId);
        return "PROCESSED";
      }
      case "PAYMENT_FAILED": {
        // A failure never downgrades a captured payment (UPI retries can fail first and succeed later).
        const row = await payments.findByOrder(provider.id, event.providerOrderId);
        if (!row) return "IGNORED";
        await payments.recordFailure(row.id, event.failure.code, event.failure.description);
        return "PROCESSED";
      }
      case "REFUND_PROCESSED":
      case "REFUND_FAILED":
        await payments.markRefundByProviderId(
          event.providerRefundId,
          event.type === "REFUND_PROCESSED" ? "PROCESSED" : "FAILED",
        );
        return "PROCESSED";
      default:
        return "IGNORED";
    }
  }

  return {
    providerId: provider.id,

    /** The renter starts (or resumes) checkout for an approved booking. */
    async startCheckout(actor: Actor, bookingId: string): Promise<CheckoutSession> {
      const renter = requireUser(actor);
      const booking = await bookings.detail(actor, bookingId);
      if (booking.viewerRole !== "RENTER") throw new NotFoundError("Booking");
      if (booking.status !== "AWAITING_PAYMENT")
        throw new PreconditionError("NOT_PAYABLE", "This booking is not waiting for payment.");
      if (
        !booking.expiresAt ||
        booking.expiresAt.getTime() - clock.now().getTime() < MIN_CHECKOUT_MINUTES * MINUTE_MS
      ) {
        throw new PreconditionError(
          "PAYMENT_WINDOW_CLOSED",
          "The payment window for this booking has closed.",
        );
      }
      const payment = await payments.ensurePayment(booking.id, provider.id, booking.money.renterTotalPaise);
      if (
        payment.provider !== provider.id ||
        (payment.status !== "CREATED" && payment.status !== "AUTHORIZED")
      ) {
        throw new PreconditionError("NOT_PAYABLE", "This booking cannot be paid again.");
      }
      let orderId = payment.providerOrderId;
      if (!orderId) {
        // Provider calls never happen inside a database transaction.
        orderId = (
          await provider.createOrder({
            reference: payment.id,
            amountPaise: booking.money.renterTotalPaise,
            notes: { bookingId: booking.id, paymentId: payment.id },
          })
        ).providerOrderId;
        await payments.setOrderId(payment.id, orderId);
      }
      return provider.checkoutSession(orderId, booking.money.renterTotalPaise, {
        callbackUrl: `${deps.appUrl}/api/payments/callback/${provider.id}`,
        cancelUrl: `${deps.appUrl}/account/rentals/${booking.id}`,
        description: `${booking.outfit.title} · ${booking.reference}`,
        prefill: { name: renter.displayName, email: renter.email },
      });
    },

    /**
     * Browser callback. Authenticated by signature only (the provider's POST is cross-site, so there is no
     * session). A signature proves authorisation, not capture, so the payment is re-fetched from the provider.
     */
    async handleCallback(params: Readonly<Record<string, string | undefined>>): Promise<CallbackResult> {
      const verified = provider.verifyCallback(params);
      if (!verified.ok) return { bookingId: null, outcome: "INVALID" };
      const row = await payments.findByOrder(provider.id, verified.providerOrderId);
      if (!row) return { bookingId: null, outcome: "INVALID" };
      const p = await provider.fetchPayment(verified.providerPaymentId);
      if (p.providerOrderId !== verified.providerOrderId)
        return { bookingId: row.bookingId, outcome: "INVALID" };
      if (p.status === "AUTHORIZED") {
        await payments.recordAuthorized(row.id, p.providerPaymentId);
        return { bookingId: row.bookingId, outcome: "PENDING" };
      }
      if (p.status !== "CAPTURED") return { bookingId: row.bookingId, outcome: "PENDING" };
      try {
        return { bookingId: row.bookingId, outcome: await capture(row, p) };
      } catch (error) {
        if (!isUnexpectedCapture(error)) throw error;
        await flagUnexpectedCapture(error, "callback:" + p.providerPaymentId);
        return { bookingId: row.bookingId, outcome: "INVALID" };
      }
    },

    /**
     * Webhook inbox: verify the signature over the raw body before storing anything; record the event
     * once per provider event id; process it; on failure answer 500 so the provider retries.
     */
    async handleWebhook(
      rawBody: string,
      headers: Readonly<Record<string, string | undefined>>,
    ): Promise<{ status: number; body: string }> {
      const parsed = provider.parseWebhook(rawBody, headers);
      if (!parsed.ok) return { status: parsed.reason === "BAD_SIGNATURE" ? 401 : 400, body: parsed.reason };
      const stored = await payments.inboxInsert(
        provider.id,
        parsed.event.eventId,
        parsed.event.providerEventType,
        parsed.event,
      );
      if (!stored.isNew && (stored.status === "PROCESSED" || stored.status === "IGNORED"))
        return { status: 200, body: "duplicate" };
      try {
        await payments.inboxMark(stored.id, await processEvent(parsed.event));
        return { status: 200, body: "ok" };
      } catch (error) {
        if (isUnexpectedCapture(error)) {
          await flagUnexpectedCapture(error, parsed.event.eventId);
          await payments.inboxMark(stored.id, "IGNORED", error.code);
          return { status: 200, body: "flagged" };
        }
        await payments.inboxMark(stored.id, "FAILED", error instanceof Error ? error.message : String(error));
        return { status: 500, body: "failed" };
      }
    },

    /** Sends PENDING refunds to the provider (outbox). Safe to run concurrently: rows are claimed with SKIP LOCKED. */
    async dispatchRefunds(limit = 20) {
      const claimed = await payments.claimRefunds(limit);
      let sent = 0;
      for (const r of claimed) {
        try {
          const result = await provider.createRefund({
            providerPaymentId: r.providerPaymentId,
            amountPaise: r.amountPaise,
            reference: r.id,
          });
          if (result.status === "FAILED") {
            // The provider refused it: mark FAILED so an administrator sees it and can retry, rather than
            // leaving it INITIATED with a provider id, where nothing would ever pick it up again.
            await payments.failRefundAttempt(
              r.id,
              "The payment provider reported the refund as failed.",
              true,
            );
            continue;
          }
          await payments.completeRefund(r.id, result.providerRefundId, result.status === "PROCESSED");
          sent++;
        } catch (error) {
          await payments.failRefundAttempt(
            r.id,
            error instanceof Error ? error.message : String(error),
            r.attempts + 1 >= MAX_REFUND_ATTEMPTS,
          );
        }
      }
      return { claimed: claimed.length, sent };
    },

    /** Before an unpaid booking expires, ask the provider whether the order was paid after all. */
    async reconcile(bookingId: string) {
      const order = await payments.orderForBooking(bookingId);
      if (!order || order.provider !== provider.id) return;
      const paid = await provider.findCapturedPaymentForOrder(order.providerOrderId);
      if (paid) await capture({ bookingId }, paid);
    },
  };
}

export type PaymentsUseCases = ReturnType<typeof paymentsUseCases>;
