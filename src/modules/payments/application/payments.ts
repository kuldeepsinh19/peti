import type { BookingsUseCases, CaptureOutcome } from "@/modules/bookings";
import type { Actor } from "@/shared/application/actor";
import type { AuditLog } from "@/shared/application/audit";
import { requireUser } from "@/shared/application/authorization";
import type { Clock } from "@/shared/domain/clock";
import { MINUTE_MS } from "@/shared/domain/clock";
import { NotFoundError, PreconditionError } from "@/shared/domain/errors";
import type {
  CheckoutSession,
  PaymentProvider,
  ProviderEvent,
  ProviderId,
  ProviderPayment,
} from "../domain/payment-provider";

/** Our payments row, as the pipeline needs it. */
export interface PaymentRef {
  id: string;
  bookingId: string;
  provider: ProviderId;
  status: string;
  amountPaise: number;
  providerOrderId: string | null;
  providerPaymentId: string | null;
}

export interface PaymentRepository {
  ensurePayment(
    bookingId: string,
    provider: ProviderId,
    amountPaise: number,
  ): Promise<{ id: string; status: string; providerOrderId: string | null; provider: string }>;
  setOrderId(paymentId: string, providerOrderId: string): Promise<void>;
  findByOrder(provider: ProviderId, providerOrderId: string): Promise<PaymentRef | null>;
  findForBooking(bookingId: string): Promise<PaymentRef | null>;
  /** Orders to ask the provider about again (recent, and not checked lately), least recently checked first. */
  dueForReconciliation(provider: ProviderId, limit: number): Promise<PaymentRef[]>;
  markReconciled(paymentId: string): Promise<void>;
  /** A capture call failed while the authorisation can still be captured: the sweep retries it. */
  recordCaptureFailure(paymentId: string, error: string): Promise<void>;
  /** The claimed authorisation can no longer be captured: the booking may claim another one. */
  releaseClaim(paymentId: string, providerPaymentId: string, error: string): Promise<void>;
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
  /**
   * Applies the provider's final word on a refund, matched by provider refund id, or by our reference
   * (refunds.id) while the provider id was never stored. False when nothing changed. Audited.
   */
  settleRefund(
    match: { providerRefundId: string; reference: string | null },
    status: "PROCESSED" | "FAILED",
    source: "webhook" | "reconciliation",
  ): Promise<boolean>;
  /** Refunds sent to the provider and still pending, not checked since `checkedBefore`, oldest first. */
  refundsAwaitingProvider(
    checkedBefore: Date,
    limit: number,
  ): Promise<Array<{ id: string; providerRefundId: string }>>;
  markRefundChecked(id: string): Promise<void>;
  /**
   * Records a chargeback, linked to the booking whose payment (or reversed stray payment) it disputes.
   * Idempotent per provider dispute; a resolved dispute never reopens. False when nothing changed. Audited.
   */
  recordDispute(
    provider: ProviderId,
    dispute: {
      providerDisputeId: string;
      providerPaymentId: string;
      status: DisputeStatus;
      amountPaise: number;
      reasonCode: string | null;
    },
  ): Promise<boolean>;
}

export type DisputeStatus = "OPEN" | "WON" | "LOST" | "CLOSED";

const DISPUTE_STATUS = {
  DISPUTE_OPENED: "OPEN",
  DISPUTE_WON: "WON",
  DISPUTE_LOST: "LOST",
  DISPUTE_CLOSED: "CLOSED",
} as const satisfies Record<string, DisputeStatus>;

export interface PaymentsDeps {
  provider: PaymentProvider;
  payments: PaymentRepository;
  bookings: Pick<BookingsUseCases, "detail" | "claimAuthorization" | "recordCapturedPayment">;
  clock: Clock;
  appUrl: string;
  audit: AuditLog;
}

/**
 * - PENDING: nothing to apply yet (not authorised, or the capture call failed and will be retried);
 * - DECLINED: an authorisation Peti will not capture (the provider returns it to the payer);
 * - IGNORED: a payment in a state that never applies to a booking (already refunded).
 */
export type ApplyOutcome = CaptureOutcome | "PENDING" | "DECLINED" | "IGNORED";

export interface CallbackResult {
  bookingId: string | null;
  outcome: CaptureOutcome | "PENDING" | "DECLINED" | "INVALID";
}

const MAX_REFUND_ATTEMPTS = 5;
/** A refund still pending this long after it was sent (or last checked) is asked about directly. */
const REFUND_CHECK_AFTER_MINUTES = 30;
const MIN_CHECKOUT_MINUTES = 2;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export function paymentsUseCases(deps: PaymentsDeps) {
  const { provider, payments, bookings, clock } = deps;

  /** Records a capture with the bookings module, the only path to CONFIRMED (or to a reversal). */
  function recordCapture(row: PaymentRef, p: ProviderPayment) {
    return bookings.recordCapturedPayment({
      bookingId: row.bookingId,
      provider: provider.id,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      currency: p.currency,
      method: p.method,
    });
  }

  /**
   * Claims an authorisation for the booking (at most one per booking, exact amount, booking still waiting
   * for payment), then captures it, outside any database transaction. A failed capture call is checked
   * against the provider: it may have succeeded for a concurrent caller or an earlier attempt.
   */
  async function claimAndCapture(row: PaymentRef, p: ProviderPayment): Promise<ApplyOutcome> {
    const claim = await bookings.claimAuthorization({
      bookingId: row.bookingId,
      provider: provider.id,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      currency: p.currency,
    });
    if (claim === "DECLINED") return "DECLINED";
    if (claim === "ALREADY_CAPTURED") return "ALREADY_CONFIRMED";
    try {
      return await recordCapture(row, await provider.capturePayment(p.providerPaymentId, p.amountPaise));
    } catch (error) {
      const current = await provider.fetchPayment(p.providerPaymentId).catch(() => null);
      if (current?.status === "CAPTURED") return recordCapture(row, current);
      if (current && current.status !== "AUTHORIZED") {
        await payments.releaseClaim(row.id, p.providerPaymentId, errorText(error));
      } else {
        await payments.recordCaptureFailure(row.id, errorText(error));
      }
      return "PENDING";
    }
  }

  /**
   * One pipeline for every report of a payment: browser callback (re-fetched from the provider), signed
   * webhook, or reconciliation. Never trusts the browser: the callback only names the payment to fetch.
   */
  async function applyProviderPayment(row: PaymentRef, p: ProviderPayment): Promise<ApplyOutcome> {
    switch (p.status) {
      case "CAPTURED":
        return recordCapture(row, p);
      case "AUTHORIZED":
        return claimAndCapture(row, p);
      case "REFUNDED":
        return "IGNORED";
      default:
        return "PENDING";
    }
  }

  /**
   * Asks the provider for every payment made on the order and applies them: captured money first (it is
   * confirmed, refunded as late, or reversed), then authorisations while the booking can still be paid,
   * the one already claimed first, so a capture retry never loses its place to a newer attempt.
   */
  async function reconcileOrder(row: PaymentRef): Promise<ApplyOutcome[]> {
    if (!row.providerOrderId || row.provider !== provider.id) return [];
    const attempts = await provider.listOrderPayments(row.providerOrderId);
    const outcomes: ApplyOutcome[] = [];
    for (const p of attempts.filter((a) => a.status === "CAPTURED")) {
      outcomes.push(await applyProviderPayment(row, p));
    }
    const paid = outcomes.some((o) => o === "CONFIRMED" || o === "ALREADY_CONFIRMED");
    if (paid || (row.status !== "CREATED" && row.status !== "AUTHORIZED")) return outcomes;
    const authorised = attempts
      .filter((a) => a.status === "AUTHORIZED")
      .sort(
        (a, b) =>
          Number(b.providerPaymentId === row.providerPaymentId) -
          Number(a.providerPaymentId === row.providerPaymentId),
      );
    for (const p of authorised) {
      const outcome = await applyProviderPayment(row, p);
      outcomes.push(outcome);
      if (outcome !== "DECLINED") break;
    }
    return outcomes;
  }

  async function processEvent(event: ProviderEvent): Promise<"PROCESSED" | "IGNORED"> {
    switch (event.type) {
      case "PAYMENT_CAPTURED":
      case "PAYMENT_AUTHORIZED": {
        const row = await payments.findByOrder(provider.id, event.providerOrderId);
        if (!row) return "IGNORED";
        await applyProviderPayment(row, {
          providerPaymentId: event.providerPaymentId,
          providerOrderId: event.providerOrderId,
          status: event.type === "PAYMENT_CAPTURED" ? "CAPTURED" : "AUTHORIZED",
          amountPaise: event.amountPaise,
          currency: event.currency,
          method: event.method,
        });
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
        await payments.settleRefund(
          { providerRefundId: event.providerRefundId, reference: event.reference },
          event.type === "REFUND_PROCESSED" ? "PROCESSED" : "FAILED",
          "webhook",
        );
        return "PROCESSED";
      case "DISPUTE_OPENED":
      case "DISPUTE_WON":
      case "DISPUTE_LOST":
      case "DISPUTE_CLOSED":
        // An open chargeback holds the owner's payout until it is resolved.
        await payments.recordDispute(provider.id, {
          providerDisputeId: event.providerDisputeId,
          providerPaymentId: event.providerPaymentId,
          status: DISPUTE_STATUS[event.type],
          amountPaise: event.amountPaise,
          reasonCode: event.reasonCode,
        });
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
      if (payment.status === "AUTHORIZED") {
        // A payment is already authorised and being captured: a second one would only be returned.
        throw new PreconditionError(
          "PAYMENT_PROCESSING",
          "We have received your payment and are confirming it. Refresh this page in a minute.",
        );
      }
      if (payment.provider !== provider.id || payment.status !== "CREATED") {
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
     * session). A signature proves the checkout finished, not that money moved, so the payment is fetched
     * from the provider and goes through the same pipeline as a webhook.
     */
    async handleCallback(params: Readonly<Record<string, string | undefined>>): Promise<CallbackResult> {
      const verified = provider.verifyCallback(params);
      if (!verified.ok) return { bookingId: null, outcome: "INVALID" };
      const row = await payments.findByOrder(provider.id, verified.providerOrderId);
      if (!row) return { bookingId: null, outcome: "INVALID" };
      const p = await provider.fetchPayment(verified.providerPaymentId);
      if (p.providerOrderId !== verified.providerOrderId)
        return { bookingId: row.bookingId, outcome: "INVALID" };
      const outcome = await applyProviderPayment(row, p);
      return { bookingId: row.bookingId, outcome: outcome === "IGNORED" ? "INVALID" : outcome };
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
        await payments.inboxMark(stored.id, "FAILED", errorText(error));
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
          await payments.failRefundAttempt(r.id, errorText(error), r.attempts + 1 >= MAX_REFUND_ATTEMPTS);
        }
      }
      return { claimed: claimed.length, sent };
    },

    /**
     * Catches what webhooks missed: asks the provider about every recent order and applies what it reports
     * through the same pipeline (an authorisation is captured or left, a capture is confirmed, refunded as
     * late, or reversed). Safe to run concurrently with webhooks and with itself.
     */
    async reconcilePayments(limit = 25) {
      const due = await payments.dueForReconciliation(provider.id, limit);
      const report = { checked: due.length, applied: 0, errors: 0 };
      for (const row of due) {
        try {
          const outcomes = await reconcileOrder(row);
          report.applied += outcomes.filter((o) => o !== "ALREADY_CONFIRMED" && o !== "IGNORED").length;
        } catch {
          // Provider unreachable or a row that cannot be applied: checked again on a later run.
          report.errors++;
        } finally {
          await payments.markReconciled(row.id);
        }
      }
      return report;
    },

    /**
     * Settles refunds whose webhook never arrived by asking the provider directly. Refunds the provider
     * still reports as pending are checked again later (normal-speed refunds take days).
     */
    async reconcileRefunds(limit = 20) {
      const checkedBefore = new Date(clock.now().getTime() - REFUND_CHECK_AFTER_MINUTES * MINUTE_MS);
      const due = await payments.refundsAwaitingProvider(checkedBefore, limit);
      let settled = 0;
      let errors = 0;
      for (const r of due) {
        try {
          const result = await provider.fetchRefund(r.providerRefundId);
          if (result.status === "PENDING") {
            await payments.markRefundChecked(r.id);
          } else if (
            await payments.settleRefund(
              { providerRefundId: r.providerRefundId, reference: null },
              result.status,
              "reconciliation",
            )
          ) {
            settled++;
          }
        } catch {
          // Provider unreachable: the refund stays due and is checked on the next run.
          errors++;
        }
      }
      return { checked: due.length, settled, errors };
    },

    /** Before an unpaid booking expires, ask the provider whether the order was paid after all. */
    async reconcile(bookingId: string) {
      const row = await payments.findForBooking(bookingId);
      if (row) await reconcileOrder(row);
    },
  };
}

export type PaymentsUseCases = ReturnType<typeof paymentsUseCases>;
