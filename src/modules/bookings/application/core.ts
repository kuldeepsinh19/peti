import { settle } from "@/modules/deposits";
import type { NotificationDraft } from "@/modules/notifications";
import type { Actor } from "@/shared/application/actor";
import { ConcurrencyError, ForbiddenError, NotFoundError, PreconditionError } from "@/shared/domain/errors";
import { formatLocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { holdRange } from "../domain/booking-rules";
import {
  type BookingActorRole,
  type BookingCommand,
  type BookingStatus,
  holdsCalendar,
  resolveTransition,
  statusLabel,
} from "../domain/booking-state-machine";
import type { BookingPatch, BookingRecord, BookingStore, RefundReason, SettlementBasis } from "./ports";

export class DatesUnavailableError extends PreconditionError {
  constructor() {
    super(
      "DATES_UNAVAILABLE",
      "Those dates are no longer free for this outfit — another booking or the owner's calendar holds them.",
    );
  }
}

/** The actor's relationship to a booking. Admins act as ADMIN even on bookings they are part of. */
export function roleOn(booking: BookingRecord, actor: Actor): BookingActorRole | null {
  if (actor.kind === "system") return "SYSTEM";
  if (actor.isAdmin) return "ADMIN";
  if (actor.userId === booking.ownerId) return "OWNER";
  if (actor.userId === booking.renterId) return "RENTER";
  return null;
}

export async function loadBooking(
  store: BookingStore,
  bookingId: string,
  lock = true,
): Promise<BookingRecord> {
  const booking = await store.getBooking(bookingId, { lock });
  if (!booking) throw new NotFoundError("Booking");
  return booking;
}

/** Throws unless the actor holds one of the roles; returns the role. Strangers see "not found". */
export function requireRole(
  booking: BookingRecord,
  actor: Actor,
  allowed: readonly BookingActorRole[],
): BookingActorRole {
  const role = roleOn(booking, actor);
  if (!role) throw new NotFoundError("Booking");
  if (!allowed.includes(role)) throw new ForbiddenError("You cannot do that on this booking.");
  return role;
}

const link = (b: BookingRecord) => `/account/rentals/${b.id}`;
const ownerLink = (b: BookingRecord) => `/lend/requests/${b.id}`;

/** Who hears about which change, in plain words. */
function draftsFor(b: BookingRecord, to: BookingStatus, historyId: number): NotificationDraft[] {
  const dates = `${formatLocalDate(b.startDate)} – ${formatLocalDate(b.endDate)}`;
  const toRenter = (subject: string, body: string): NotificationDraft => ({
    userId: b.renterId,
    type: `booking.${to.toLowerCase()}`,
    subject,
    body,
    link: link(b),
    dedupeKey: `${b.id}:${historyId}:${b.renterId}`,
    channels: ["IN_APP", "EMAIL"],
  });
  const toOwner = (subject: string, body: string): NotificationDraft => ({
    userId: b.ownerId,
    type: `booking.${to.toLowerCase()}`,
    subject,
    body,
    link: ownerLink(b),
    dedupeKey: `${b.id}:${historyId}:${b.ownerId}`,
    channels: ["IN_APP", "EMAIL"],
  });
  switch (to) {
    case "AWAITING_PAYMENT":
      return [
        toRenter(
          `Approved: ${b.outfitTitle}`,
          `The owner accepted your request for ${dates}. Pay ${formatInr(b.renterTotalPaise)} to confirm — the dates are held for you until then.`,
        ),
      ];
    case "REJECTED":
      return [
        toRenter(
          `Not available: ${b.outfitTitle}`,
          `Your request for ${dates} was declined. Nothing was charged.`,
        ),
      ];
    case "EXPIRED":
      return [
        toRenter(`Expired: ${b.outfitTitle}`, `Your request for ${dates} expired. Nothing was charged.`),
        toOwner(
          `Expired: ${b.outfitTitle}`,
          `The booking ${b.reference} for ${dates} expired and the dates are free again.`,
        ),
      ];
    case "CONFIRMED":
      return [
        toRenter(
          `Confirmed: ${b.outfitTitle}`,
          `Payment received. Your booking ${b.reference} for ${dates} is confirmed; the owner's contact details are now on the booking page.`,
        ),
        toOwner(
          `Paid and confirmed: ${b.outfitTitle}`,
          `${b.reference} for ${dates} is paid. Arrange the handover and photograph the outfit when you hand it over.`,
        ),
      ];
    case "CANCELLED":
      return [
        toRenter(
          `Cancelled: ${b.outfitTitle}`,
          `Booking ${b.reference} for ${dates} was cancelled. Any refund due is on its way.`,
        ),
        toOwner(
          `Cancelled: ${b.outfitTitle}`,
          `Booking ${b.reference} for ${dates} was cancelled and the dates are free again.`,
        ),
      ];
    case "ACTIVE":
      return [
        toOwner(
          `Handed over: ${b.outfitTitle}`,
          `The renter acknowledged the handover of ${b.reference}. Return is due on ${formatLocalDate(b.endDate)}.`,
        ),
      ];
    case "RETURNED":
      return [
        toRenter(
          `Returned: ${b.outfitTitle}`,
          `The owner recorded the return of ${b.reference}. Your deposit is settled once their inspection window closes.`,
        ),
      ];
    case "DISPUTED":
      return [
        toRenter(
          `Dispute opened: ${b.reference}`,
          `A dispute was opened on ${b.reference}. The deposit stays held until it is resolved.`,
        ),
        toOwner(
          `Dispute opened: ${b.reference}`,
          `A dispute was opened on ${b.reference}. An administrator will review the condition reports.`,
        ),
      ];
    case "COMPLETED":
      return [
        toRenter(
          `Completed: ${b.outfitTitle}`,
          `Booking ${b.reference} is complete. Your deposit refund has been initiated. You can now leave a review.`,
        ),
        toOwner(
          `Completed: ${b.outfitTitle}`,
          `Booking ${b.reference} is complete and your payout is recorded. You can now review the renter.`,
        ),
      ];
    default:
      return [];
  }
}

export interface TransitionOptions {
  to?: BookingStatus;
  patch?: BookingPatch;
  reason?: string | undefined;
  metadata?: Record<string, unknown>;
  actorUserId: string | null;
  createdBy?: string;
}

/**
 * The single way a booking changes status: validates the transition, takes or releases the calendar hold,
 * compare-and-swaps the status, appends history and queues notifications — all in the caller's transaction.
 */
export async function applyTransition(
  store: BookingStore,
  booking: BookingRecord,
  command: BookingCommand,
  role: BookingActorRole,
  opts: TransitionOptions,
): Promise<BookingRecord> {
  const from = booking.status;
  const to = resolveTransition(from, command, role, opts.to);

  if (!holdsCalendar(from) && holdsCalendar(to)) {
    const range = holdRange(booking, booking.bufferDays);
    const ok = await store.insertHold(
      booking.id,
      booking.outfitId,
      range.startsOn,
      range.endsBefore,
      opts.createdBy ?? booking.ownerId,
    );
    if (!ok) throw new DatesUnavailableError();
  } else if (holdsCalendar(from) && !holdsCalendar(to)) {
    await store.deleteHold(booking.id);
  }

  const updated = await store.updateStatus(booking.id, from, to, opts.patch ?? {});
  if (!updated) throw new ConcurrencyError();
  const historyId = await store.appendHistory({
    bookingId: booking.id,
    fromStatus: from,
    toStatus: to,
    command,
    actorRole: role,
    actorUserId: role === "SYSTEM" ? null : opts.actorUserId,
    reason: opts.reason,
    metadata: opts.metadata,
  });
  const next = { ...booking, status: to };
  await store.notify(draftsFor(next, to, historyId));
  if (role === "ADMIN") {
    await store.audit({
      actorUserId: opts.actorUserId,
      actorRole: "ADMIN",
      action: `booking.${command}`,
      entityType: "booking",
      entityId: booking.id,
      before: { status: from },
      after: { status: to },
      ...(opts.reason ? { reason: opts.reason } : {}),
    });
  }
  return next;
}

/**
 * Settles a paid booking: refund to the renter, deposit outcome and owner payout, all derived from one
 * pure calculation so money is always conserved.
 */
export async function settleMoney(
  store: BookingStore,
  booking: BookingRecord,
  input: {
    retainedFeePaise: number;
    lateFeePaise: number;
    damagePaise: number;
    basis: SettlementBasis;
    refundReason: RefundReason;
    role: BookingActorRole;
    actorUserId: string | null;
    at: Date;
  },
) {
  const payment = await store.getPayment(booking.id, { lock: true });
  if (!payment || payment.status !== "CAPTURED") {
    throw new PreconditionError(
      "NOT_PAID",
      `${statusLabel[booking.status]} bookings without a captured payment cannot be settled.`,
    );
  }
  const s = settle({
    rentalFeePaise: booking.rentalFeePaise,
    depositPaise: booking.depositPaise,
    commissionRateBps: booking.commissionRateBps,
    retainedFeePaise: input.retainedFeePaise,
    lateFeePaise: input.lateFeePaise,
    damagePaise: input.damagePaise,
  });
  if (s.refund.totalPaise > 0) {
    await store.insertRefund({
      paymentId: payment.id,
      bookingId: booking.id,
      reason: input.refundReason,
      amountPaise: s.refund.totalPaise,
      rentalFeePortionPaise: s.refund.rentalFeePortionPaise,
      depositPortionPaise: s.refund.depositPortionPaise,
      initiatedByRole: input.role,
      initiatedByUserId: input.role === "SYSTEM" ? null : input.actorUserId,
    });
  }
  await store.settleDeposit(booking.id, { ...s.deposit, basis: input.basis, at: input.at });
  if (s.payout) await store.insertPayout({ bookingId: booking.id, ownerId: booking.ownerId, ...s.payout });
  return s;
}
