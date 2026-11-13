import type { Actor } from "@/shared/application/actor";
import { requireAdmin, requireUser } from "@/shared/application/authorization";
import { NotFoundError, PreconditionError, ValidationError } from "@/shared/domain/errors";
import { addDays, localDateInIndia } from "@/shared/domain/local-date";
import { parseInput } from "@/shared/contracts/validation";
import type { BookingActorRole } from "../domain/booking-state-machine";
import { disputeMessageSchema, openDisputeSchema, resolveDisputeSchema } from "./contracts";
import { applyTransition, loadBooking, requireRole, settleMoney } from "./core";
import type { BookingRecord, BookingsDeps, BookingStore } from "./ports";

type Kind = (typeof openDisputeSchema)["shape"]["kind"]["options"][number];

/** Which participant may raise which kind of dispute, and from which state (booking-lifecycle.md). */
const ALLOWED: Record<string, Partial<Record<BookingActorRole, readonly Kind[]>>> = {
  CONFIRMED: {
    RENTER: ["HANDOVER_FAILED", "NOT_AS_DESCRIBED", "OTHER"],
    OWNER: ["HANDOVER_FAILED", "OTHER"],
    ADMIN: ["OTHER", "HANDOVER_FAILED", "NOT_AS_DESCRIBED"],
  },
  ACTIVE: {
    OWNER: ["NOT_RETURNED", "OTHER"],
    RENTER: ["RETURN_NOT_ACKNOWLEDGED", "OTHER"],
    ADMIN: ["NOT_RETURNED", "OTHER"],
  },
  RETURNED: {
    OWNER: ["DAMAGE", "MISSING_ITEMS"],
    RENTER: ["LATE_FEE_CONTESTED"],
    ADMIN: ["DAMAGE", "MISSING_ITEMS", "OTHER"],
  },
};

function assertCanOpen(
  booking: BookingRecord,
  role: BookingActorRole,
  kind: Kind,
  now: Date,
  claimedPaise: number | null,
  handoverRecorded: boolean,
) {
  const kinds = ALLOWED[booking.status]?.[role];
  if (!kinds || !kinds.includes(kind)) {
    throw new PreconditionError(
      "DISPUTE_NOT_ALLOWED",
      "That kind of dispute cannot be opened at this stage of the rental.",
    );
  }
  const today = localDateInIndia(now);
  // Once the owner has recorded the handover (allowed from the day before the start), cancelling is no
  // longer possible, so reporting a problem must be possible from that moment too.
  const earliest = handoverRecorded ? addDays(booking.startDate, -1) : booking.startDate;
  if (booking.status === "CONFIRMED" && today < earliest) {
    throw new PreconditionError(
      "TOO_EARLY",
      "Handover problems can be reported once the handover is recorded or the rental has started.",
    );
  }
  if (kind === "NOT_RETURNED" && today <= booking.endDate) {
    throw new PreconditionError("NOT_OVERDUE", "The rental has not ended yet.");
  }
  if (booking.status === "RETURNED" && booking.inspectionDeadline && now > booking.inspectionDeadline) {
    throw new PreconditionError("WINDOW_CLOSED", "The inspection window has closed.");
  }
  if (kind === "DAMAGE" || kind === "MISSING_ITEMS") {
    const maxClaim = booking.depositPaise - (booking.lateFeePaise ?? 0);
    if (!claimedPaise)
      throw new ValidationError("Enter the amount you are claiming.", { claimedRupees: ["Required."] });
    if (claimedPaise > maxClaim) {
      throw new ValidationError("A claim cannot exceed the deposit (less any late fee).", {
        claimedRupees: [`At most ₹${Math.floor(maxClaim / 100)}.`],
      });
    }
  }
}

export async function openDispute(deps: BookingsDeps, actor: Actor, input: unknown) {
  const data = parseInput(openDisputeSchema, input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId);
    const role = requireRole(booking, actor, ["RENTER", "OWNER", "ADMIN"]);
    const claimed = data.claimedRupees ? data.claimedRupees * 100 : null;
    const handoverRecorded =
      booking.status === "CONFIRMED" && (await store.getConditionReport(booking.id, "HANDOVER")) !== null;
    assertCanOpen(booking, role, data.kind, now, claimed, handoverRecorded);
    if (await store.hasOpenDispute(booking.id))
      throw new PreconditionError("DISPUTE_OPEN", "A dispute is already open.");
    const userId = requireUser(actor).userId;
    const disputeId = await store.insertDispute({
      bookingId: booking.id,
      openedById: userId,
      openedByRole: role,
      openedFromStatus: booking.status,
      kind: data.kind,
      description: data.description,
      claimedAmountPaise: claimed,
    });
    await applyTransition(store, booking, "openDispute", role, {
      actorUserId: userId,
      reason: data.kind,
      metadata: { disputeId },
    });
    return { disputeId };
  });
}

async function settleDispute(
  store: BookingStore,
  booking: BookingRecord,
  args: {
    retainedFeePaise: number;
    damagePaise: number;
    role: BookingActorRole;
    userId: string | null;
    at: Date;
    basis: "RESPONDENT_ACCEPTED" | "WITHDRAWN" | "ADMIN_DECISION";
    to: "COMPLETED" | "CANCELLED";
    notes: string | null;
  },
) {
  const dispute = await store.getOpenDispute(booking.id);
  if (!dispute) throw new NotFoundError("Open dispute");
  // A late fee fixed at return stays withheld unless the admin decides otherwise; on cancellation it does not apply.
  const lateFee =
    args.to === "COMPLETED" && args.basis !== "ADMIN_DECISION" ? (booking.lateFeePaise ?? 0) : 0;
  const s = await settleMoney(store, booking, {
    retainedFeePaise: args.retainedFeePaise,
    lateFeePaise: lateFee,
    damagePaise: args.damagePaise,
    basis: args.basis,
    refundReason: "DISPUTE_RESOLUTION",
    role: args.role,
    actorUserId: args.userId,
    at: args.at,
  });
  await store.resolveDispute(dispute.id, {
    resolution: args.basis === "ADMIN_DECISION" ? "ADMIN_DECISION" : args.basis,
    resolvedById: args.userId,
    at: args.at,
    notes: args.notes,
    awardedDepositPaise: s.deposit.withheldPaise,
    rentalRefundPaise: s.refund.rentalFeePortionPaise,
  });
  await applyTransition(store, booking, "resolveDispute", args.role, {
    to: args.to,
    actorUserId: args.userId,
    reason: args.notes ?? args.basis,
    patch:
      args.to === "COMPLETED"
        ? { completedAt: args.at, inspectionDeadline: null }
        : { cancelledAt: args.at, closedReason: "DISPUTE_RESOLUTION" },
  });
}

/** The respondent accepts the claim as made: settled immediately. */
export async function acceptClaim(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId } = parseInput(disputeMessageSchema.pick({ bookingId: true }), input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["RENTER", "OWNER"]);
    const dispute = await store.getOpenDispute(booking.id);
    if (!dispute) throw new NotFoundError("Open dispute");
    if (dispute.openedByRole === role)
      throw new PreconditionError("NOT_RESPONDENT", "Only the other person can accept a claim.");
    // Only a claim one participant made against the other can be settled by the other's acceptance. A claim
    // opened by an administrator or the system has no single respondent (the owner could otherwise accept a
    // damage claim in their own favour), so it is decided by an administrator.
    const openedByParticipant = dispute.openedByRole === "RENTER" || dispute.openedByRole === "OWNER";
    if (!openedByParticipant || dispute.openedFromStatus !== "RETURNED" || !dispute.claimedAmountPaise) {
      throw new PreconditionError("NEEDS_ADMIN", "This dispute has to be decided by an administrator.");
    }
    await settleDispute(store, booking, {
      retainedFeePaise: booking.rentalFeePaise,
      damagePaise: dispute.claimedAmountPaise,
      role,
      userId: requireUser(actor).userId,
      at: now,
      basis: "RESPONDENT_ACCEPTED",
      to: "COMPLETED",
      notes: null,
    });
  });
}

/** The person who opened a post-return dispute withdraws it: settled as if the return had been confirmed. */
export async function withdrawDispute(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId } = parseInput(disputeMessageSchema.pick({ bookingId: true }), input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["RENTER", "OWNER"]);
    const dispute = await store.getOpenDispute(booking.id);
    if (!dispute) throw new NotFoundError("Open dispute");
    if (dispute.openedById !== requireUser(actor).userId)
      throw new PreconditionError("NOT_OPENER", "Only the person who opened the dispute can withdraw it.");
    if (dispute.openedFromStatus !== "RETURNED")
      throw new PreconditionError("NEEDS_ADMIN", "This dispute has to be decided by an administrator.");
    await settleDispute(store, booking, {
      retainedFeePaise: booking.rentalFeePaise,
      damagePaise: 0,
      role,
      userId: requireUser(actor).userId,
      at: now,
      basis: "WITHDRAWN",
      to: "COMPLETED",
      notes: null,
    });
  });
}

/** An administrator decides: explicit amounts and written reasons, recorded in the audit log. */
export async function resolveDispute(deps: BookingsDeps, actor: Actor, input: unknown) {
  const admin = requireAdmin(actor);
  const data = parseInput(resolveDisputeSchema, input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId);
    const retained = data.retainedFeeRupees * 100;
    const withheld = data.depositWithheldRupees * 100;
    const errors: Record<string, string[]> = {};
    if (retained > booking.rentalFeePaise) errors.retainedFeeRupees = ["Cannot exceed the rental fee."];
    if (withheld > booking.depositPaise) errors.depositWithheldRupees = ["Cannot exceed the deposit."];
    if (data.outcome === "CANCEL" && withheld > 0)
      errors.depositWithheldRupees = ["A cancelled rental releases the deposit."];
    if (Object.keys(errors).length) throw new ValidationError("Please check the amounts.", errors);
    await settleDispute(store, booking, {
      retainedFeePaise: retained,
      damagePaise: withheld,
      role: "ADMIN",
      userId: admin.userId,
      at: now,
      basis: "ADMIN_DECISION",
      to: data.outcome === "COMPLETE" ? "COMPLETED" : "CANCELLED",
      notes: data.notes,
    });
  });
}

export async function addDisputeMessage(deps: BookingsDeps, actor: Actor, input: unknown) {
  const data = parseInput(disputeMessageSchema, input);
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId, false);
    requireRole(booking, actor, ["RENTER", "OWNER", "ADMIN"]);
    const dispute = await store.getOpenDispute(booking.id);
    if (!dispute) throw new NotFoundError("Open dispute");
    await store.addDisputeMessage(dispute.id, requireUser(actor).userId, data.body);
  });
}
