import { NotFoundError } from "@/shared/domain/errors";
import { applyTransition, loadBooking } from "./core";
import { rejectOverlappingRequests } from "./decisions";
import type { BookingStore, BookingsDeps, PaymentRow } from "./ports";

export interface CapturedPayment {
  bookingId: string;
  provider: string;
  providerPaymentId: string;
  amountPaise: number;
  currency: string;
  method: string | null;
}

export type AuthorizedPayment = Omit<CapturedPayment, "method">;

/**
 * - CONFIRMED / ALREADY_CONFIRMED: the payment is the booking's payment.
 * - LATE_CAPTURE_REFUNDED: the money arrived after the booking expired or was cancelled; refunded in full.
 * - UNEXPECTED_CAPTURE_REVERSED: a second payment, or one for the wrong amount, was captured; it is never
 *   applied to the booking and a reversal refund for exactly that provider payment is queued (ADR-006).
 */
export type CaptureOutcome =
  "CONFIRMED" | "ALREADY_CONFIRMED" | "LATE_CAPTURE_REFUNDED" | "UNEXPECTED_CAPTURE_REVERSED";

/**
 * - CLAIMED: this authorisation is the booking's payment; the caller captures it (again, if it is a retry).
 * - ALREADY_CAPTURED: it was captured already; the caller records the capture.
 * - DECLINED: it must not be captured. The provider returns an uncaptured authorisation to the payer.
 */
export type ClaimOutcome = "CLAIMED" | "ALREADY_CAPTURED" | "DECLINED";

export type DeclineReason = "NOT_PAYABLE" | "ALREADY_PAID" | "AMOUNT_MISMATCH";

function declineReason(
  booking: { status: string },
  payment: PaymentRow,
  p: AuthorizedPayment,
): DeclineReason | null {
  if (payment.status === "CAPTURED" || payment.status === "AUTHORIZED") return "ALREADY_PAID";
  if (payment.status !== "CREATED" || booking.status !== "AWAITING_PAYMENT") return "NOT_PAYABLE";
  if (p.currency !== "INR" || p.amountPaise !== payment.amountPaise) return "AMOUNT_MISMATCH";
  return null;
}

/**
 * Decides whether an authorised payment may be captured for a booking. Compare-and-swap under the booking
 * and payment row locks: only one authorisation per booking is ever claimed, only while the booking is
 * waiting for payment (its calendar hold still exists; the expiry sweep reconciles before it expires a
 * booking), and only for the exact amount. The capture itself happens outside this transaction.
 */
export async function claimAuthorization(deps: BookingsDeps, p: AuthorizedPayment): Promise<ClaimOutcome> {
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, p.bookingId);
    const payment = await store.getPayment(booking.id, { lock: true });
    if (!payment) throw new NotFoundError("Payment");

    if (payment.providerPaymentId === p.providerPaymentId) {
      if (payment.status === "CAPTURED") return "ALREADY_CAPTURED";
      if (payment.status === "AUTHORIZED") return "CLAIMED";
    }
    const reason = declineReason(booking, payment, p);
    if (reason) {
      await store.audit({
        actorUserId: null,
        actorRole: "SYSTEM",
        action: "payment.authorizationDeclined",
        entityType: "booking",
        entityId: booking.id,
        after: {
          reason,
          providerPaymentId: p.providerPaymentId,
          amountPaise: p.amountPaise,
          expectedPaise: payment.amountPaise,
          bookingStatus: booking.status,
        },
        reason: "Not captured; the provider returns an uncaptured authorisation to the payer.",
      });
      return "DECLINED";
    }
    await store.claimAuthorization(payment.id, p.providerPaymentId);
    return "CLAIMED";
  });
}

/** A capture that cannot be applied to the booking: queue a refund of exactly that provider payment. */
async function reverseUnexpectedCapture(
  store: BookingStore,
  bookingId: string,
  payment: PaymentRow,
  captured: CapturedPayment,
  why: "DUPLICATE_CAPTURE" | "AMOUNT_MISMATCH",
): Promise<CaptureOutcome> {
  const queued = await store.insertReversal({
    paymentId: payment.id,
    bookingId,
    reversedProviderPaymentId: captured.providerPaymentId,
    amountPaise: captured.amountPaise,
  });
  if (queued) {
    await store.audit({
      actorUserId: null,
      actorRole: "SYSTEM",
      action: "payment.reversalQueued",
      entityType: "booking",
      entityId: bookingId,
      after: {
        reason: why,
        providerPaymentId: captured.providerPaymentId,
        amountPaise: captured.amountPaise,
        currency: captured.currency,
        bookingPaymentId: payment.providerPaymentId,
        expectedPaise: payment.amountPaise,
      },
      reason: "A capture that does not belong to the booking is refunded in full.",
    });
  }
  return "UNEXPECTED_CAPTURE_REVERSED";
}

/**
 * The only path to CONFIRMED. Called by the payments module after the provider has confirmed a capture
 * (signature verified and, for browser callbacks, re-fetched from the provider). Idempotent: the browser
 * callback, the webhook and reconciliation may all arrive, in any order and at the same time — the booking
 * and payment rows are locked, and later callers see the payment already captured.
 */
export async function recordCapturedPayment(
  deps: BookingsDeps,
  captured: CapturedPayment,
): Promise<CaptureOutcome> {
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, captured.bookingId);
    const payment = await store.getPayment(booking.id, { lock: true });
    if (!payment) throw new NotFoundError("Payment");

    if (payment.status === "CAPTURED") {
      if (payment.providerPaymentId === captured.providerPaymentId) return "ALREADY_CONFIRMED";
      return reverseUnexpectedCapture(store, booking.id, payment, captured, "DUPLICATE_CAPTURE");
    }
    if (captured.currency !== "INR" || captured.amountPaise !== payment.amountPaise) {
      return reverseUnexpectedCapture(store, booking.id, payment, captured, "AMOUNT_MISMATCH");
    }

    await store.markPaymentCaptured(payment.id, captured.providerPaymentId, captured.method, now);

    if (booking.status !== "AWAITING_PAYMENT") {
      // Money arrived after the booking expired or was cancelled: never revive it — refund everything.
      await store.insertRefund({
        paymentId: payment.id,
        bookingId: booking.id,
        reason: "LATE_CAPTURE_REVERSAL",
        amountPaise: payment.amountPaise,
        rentalFeePortionPaise: booking.rentalFeePaise,
        depositPortionPaise: booking.depositPaise,
        initiatedByRole: "SYSTEM",
        initiatedByUserId: null,
      });
      await store.audit({
        actorUserId: null,
        actorRole: "SYSTEM",
        action: "payment.lateCaptureRefunded",
        entityType: "booking",
        entityId: booking.id,
        after: { providerPaymentId: captured.providerPaymentId, amountPaise: payment.amountPaise },
        reason: "Payment captured after the booking stopped waiting for payment.",
      });
      return "LATE_CAPTURE_REFUNDED";
    }

    await store.createHeldDeposit(booking.id, payment.id, booking.depositPaise);
    await applyTransition(store, booking, "confirmPayment", "SYSTEM", {
      actorUserId: null,
      patch: { confirmedAt: now, expiresAt: null },
      metadata: { provider: captured.provider, providerPaymentId: captured.providerPaymentId },
    });
    await rejectOverlappingRequests(store, booking);
    return "CONFIRMED";
  });
}
