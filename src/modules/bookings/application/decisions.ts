import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { PreconditionError, ValidationError } from "@/shared/domain/errors";
import { localDateInIndia } from "@/shared/domain/local-date";
import { parseInput } from "@/shared/contracts/validation";
import {
  assertPaymentWindowUsable,
  holdRange,
  paymentDeadline,
  renterCancellationRetainedFee,
} from "../domain/booking-rules";
import { adminCancelSchema, bookingReasonSchema } from "./contracts";
import { applyTransition, loadBooking, requireRole, settleMoney } from "./core";
import type { BookingsDeps, BookingStore } from "./ports";

/**
 * The owner accepts a request. Lock order: outfit, then booking. The calendar hold is inserted inside the
 * same transaction; if another approval or an owner block already holds overlapping dates, the exclusion
 * constraint refuses it and nothing changes (DATES_UNAVAILABLE).
 */
export async function approveBooking(deps: BookingsDeps, actor: Actor, input: unknown) {
  const user = requireUser(actor);
  const { bookingId } = parseInput(bookingReasonSchema, input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const peek = await loadBooking(store, bookingId, false);
    const outfit = await store.lockOutfit(peek.outfitId);
    const booking = await loadBooking(store, bookingId);
    if (booking.ownerId !== user.userId) requireRole(booking, actor, []);
    if (!outfit || (outfit.status !== "ACTIVE" && outfit.status !== "PAUSED")) {
      throw new PreconditionError("OUTFIT_UNAVAILABLE", "This outfit is no longer available to rent.");
    }
    if (booking.status === "PENDING_APPROVAL" && booking.expiresAt && booking.expiresAt <= now) {
      throw new PreconditionError("REQUEST_EXPIRED", "This request has expired.");
    }
    const deadline = paymentDeadline(now, booking.startDate, booking.policy);
    assertPaymentWindowUsable(deadline, now, booking.policy);
    await applyTransition(store, booking, "approve", "OWNER", {
      actorUserId: user.userId,
      createdBy: user.userId,
      patch: { approvedAt: now, ownerAcceptedAt: now, expiresAt: deadline },
    });
    return { paymentDeadline: deadline };
  });
}

export async function rejectBooking(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId, reason } = parseInput(bookingReasonSchema, input);
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["OWNER", "ADMIN"]);
    await applyTransition(store, booking, "reject", role, {
      actorUserId: requireUser(actor).userId,
      reason,
      patch: { closedReason: "OWNER_DECLINED", expiresAt: null },
    });
  });
}

export async function withdrawRequest(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId, reason } = parseInput(bookingReasonSchema, input);
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["RENTER", "ADMIN"]);
    await applyTransition(store, booking, "withdraw", role, {
      actorUserId: requireUser(actor).userId,
      reason,
      patch: {
        closedReason: role === "ADMIN" ? "ADMIN_CANCELLED" : "RENTER_CANCELLED",
        expiresAt: null,
        cancelledAt: deps.clock.now(),
      },
    });
  });
}

/**
 * Cancels before payment (no money involved) or after payment (refund by policy):
 * - renter: deposit back in full, rental fee by notice tier;
 * - owner: everything back to the renter, and the cancellation counts against the owner;
 * - admin: an explicit retained amount and a reason, audit-logged.
 */
export async function cancelBooking(deps: BookingsDeps, actor: Actor, input: unknown) {
  const user = requireUser(actor);
  const now = deps.clock.now();
  const isAdminRequest = typeof input === "object" && input !== null && "retainedFeeRupees" in input;
  const parsed = isAdminRequest
    ? parseInput(adminCancelSchema, input)
    : parseInput(bookingReasonSchema, input);
  return deps.uow.run(async (store: BookingStore) => {
    const booking = await loadBooking(store, parsed.bookingId);
    const role = requireRole(booking, actor, ["RENTER", "OWNER", "ADMIN"]);
    if (role === "ADMIN" && !isAdminRequest) {
      throw new ValidationError("Administrators must give a reason and the amount of the fee to retain.");
    }
    const closedReason =
      role === "RENTER" ? "RENTER_CANCELLED" : role === "OWNER" ? "OWNER_CANCELLED" : "ADMIN_CANCELLED";

    if (booking.status === "AWAITING_PAYMENT") {
      await store.abandonPayment(booking.id);
    } else if (booking.status === "CONFIRMED") {
      // Once the owner has recorded the handover, or the rental has started, the garment may already have
      // changed hands: a cancellation would refund the deposit with no inspection. Problems from this point
      // go through a dispute, which keeps the deposit held. (Owners are told to record the handover report
      // before giving the garment over; the day before the start stays cancellable under the < 48 h tier.)
      if (role !== "ADMIN") {
        const handoverStarted =
          (await store.getConditionReport(booking.id, "HANDOVER")) !== null ||
          localDateInIndia(now) >= booking.startDate;
        if (handoverStarted) {
          throw new PreconditionError(
            "HANDOVER_UNDER_WAY",
            "The handover has started, so this booking can no longer be cancelled. Report a problem instead.",
          );
        }
      }
      let retained = 0;
      if (role === "RENTER")
        retained = renterCancellationRetainedFee(
          booking.rentalFeePaise,
          booking.startDate,
          now,
          booking.policy,
        );
      if (role === "ADMIN" && "retainedFeeRupees" in parsed) {
        retained = Number(parsed.retainedFeeRupees) * 100;
        if (retained > booking.rentalFeePaise) {
          throw new ValidationError("Cannot retain more than the rental fee.", {
            retainedFeeRupees: ["Too high."],
          });
        }
      }
      await settleMoney(store, booking, {
        retainedFeePaise: retained,
        lateFeePaise: 0,
        damagePaise: 0,
        basis: "CANCELLATION",
        refundReason: "CANCELLATION",
        role,
        actorUserId: user.userId,
        at: now,
      });
      if (role === "OWNER") await store.incrementOwnerCancellations(booking.ownerId);
    }
    await applyTransition(store, booking, "cancel", role, {
      actorUserId: user.userId,
      reason: parsed.reason,
      patch: { closedReason, expiresAt: null, cancelledAt: now },
    });
  });
}

/** Once a booking is paid, other requests for overlapping dates can never be approved: close them. */
export async function rejectOverlappingRequests(
  store: BookingStore,
  booking: {
    id: string;
    outfitId: string;
    startDate: string;
    endDate: string;
    rentalDays: number;
    bufferDays: number;
  },
) {
  const range = holdRange(booking as never, booking.bufferDays);
  const ids = await store.pendingOverlapping(booking.outfitId, range.startsOn, range.endsBefore, booking.id);
  for (const id of ids) {
    const pending = await loadBooking(store, id);
    if (pending.status !== "PENDING_APPROVAL") continue;
    await applyTransition(store, pending, "autoRejectDatesTaken", "SYSTEM", {
      actorUserId: null,
      reason: "Another booking for these dates was confirmed.",
      patch: { closedReason: "DATES_UNAVAILABLE", expiresAt: null },
    });
  }
}
