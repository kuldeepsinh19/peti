import { NotFoundError, PreconditionError } from "@/shared/domain/errors";
import { applyTransition, loadBooking } from "./core";
import { rejectOverlappingRequests } from "./decisions";
import type { BookingsDeps } from "./ports";

export interface CapturedPayment {
  bookingId: string;
  provider: string;
  providerPaymentId: string;
  amountPaise: number;
  currency: string;
  method: string | null;
}

export type CaptureOutcome = "CONFIRMED" | "ALREADY_CONFIRMED" | "LATE_CAPTURE_REFUNDED";

/**
 * The only path to CONFIRMED. Called by the payments module after the provider has confirmed a capture
 * (signature verified and, for browser callbacks, re-fetched from the provider). Idempotent: the browser
 * callback and the webhook may both arrive, in any order and at the same time — the booking and payment
 * rows are locked, and the second caller sees the payment already captured.
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
      if (payment.providerPaymentId !== captured.providerPaymentId) {
        throw new PreconditionError(
          "DUPLICATE_CAPTURE",
          "A different payment was already captured for this booking.",
          {
            bookingId: booking.id,
          },
        );
      }
      return "ALREADY_CONFIRMED";
    }
    if (captured.currency !== "INR" || captured.amountPaise !== payment.amountPaise) {
      throw new PreconditionError("AMOUNT_MISMATCH", "The captured amount does not match the booking.", {
        expected: payment.amountPaise,
        received: captured.amountPaise,
      });
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
