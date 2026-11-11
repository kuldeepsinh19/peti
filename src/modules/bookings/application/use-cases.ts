import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { NotFoundError } from "@/shared/domain/errors";
import { holdsCalendar } from "../domain/booking-state-machine";
import { addOwnerBlock, removeOwnerBlock } from "./calendar";
import { acknowledgeHandover, confirmReturn, recordReturn, submitHandoverReport } from "./rental";
import { approveBooking, cancelBooking, rejectBooking, withdrawRequest } from "./decisions";
import { acceptClaim, addDisputeMessage, openDispute, resolveDispute, withdrawDispute } from "./disputes";
import { type CapturedPayment, recordCapturedPayment } from "./payment-events";
import type { BookingsDeps } from "./ports";
import type { BookingDetail, BookingQueries } from "./queries";
import { requestBooking } from "./request-booking";
import { runBookingSweep } from "./sweep";

/** Contact details and the pickup address are shared only once a booking is paid. */
const CONTACT_VISIBLE = new Set(["CONFIRMED", "ACTIVE", "RETURNED", "DISPUTED", "COMPLETED"]);

export function bookingsUseCases(deps: BookingsDeps & { queries: BookingQueries }) {
  const { queries } = deps;
  return {
    request: (actor: Actor, input: unknown) => requestBooking(deps, actor, input),
    approve: (actor: Actor, input: unknown) => approveBooking(deps, actor, input),
    reject: (actor: Actor, input: unknown) => rejectBooking(deps, actor, input),
    withdraw: (actor: Actor, input: unknown) => withdrawRequest(deps, actor, input),
    cancel: (actor: Actor, input: unknown) => cancelBooking(deps, actor, input),
    submitHandoverReport: (actor: Actor, input: unknown, photos: Uint8Array[]) =>
      submitHandoverReport(deps, actor, input, photos),
    acknowledgeHandover: (actor: Actor, input: unknown) => acknowledgeHandover(deps, actor, input),
    recordReturn: (actor: Actor, input: unknown, photos: Uint8Array[]) =>
      recordReturn(deps, actor, input, photos),
    confirmReturn: (actor: Actor, input: unknown) => confirmReturn(deps, actor, input),
    openDispute: (actor: Actor, input: unknown) => openDispute(deps, actor, input),
    acceptClaim: (actor: Actor, input: unknown) => acceptClaim(deps, actor, input),
    withdrawDispute: (actor: Actor, input: unknown) => withdrawDispute(deps, actor, input),
    resolveDispute: (actor: Actor, input: unknown) => resolveDispute(deps, actor, input),
    addDisputeMessage: (actor: Actor, input: unknown) => addDisputeMessage(deps, actor, input),
    recordCapturedPayment: (captured: CapturedPayment) => recordCapturedPayment(deps, captured),
    sweep: () => runBookingSweep(deps, queries),
    addOwnerBlock: (actor: Actor, input: unknown) => addOwnerBlock(deps, actor, input),
    removeOwnerBlock: (actor: Actor, input: unknown) => removeOwnerBlock(deps, actor, input),

    myRentals: (actor: Actor) => queries.forRenter(requireUser(actor).userId),
    myLendings: (actor: Actor, statuses?: Parameters<BookingQueries["forOwner"]>[1]) =>
      queries.forOwner(requireUser(actor).userId, statuses),

    /** Participants and admins only; strangers get "not found". Contact details are redacted until paid. */
    async detail(
      actor: Actor,
      bookingId: string,
    ): Promise<BookingDetail & { viewerRole: "RENTER" | "OWNER" | "ADMIN" }> {
      const user = requireUser(actor);
      const d = await queries.detail(bookingId);
      if (!d) throw new NotFoundError("Booking");
      const viewerRole =
        user.userId === d.owner.id
          ? "OWNER"
          : user.userId === d.renter.id
            ? "RENTER"
            : user.isAdmin
              ? "ADMIN"
              : null;
      if (!viewerRole) throw new NotFoundError("Booking");
      if (CONTACT_VISIBLE.has(d.status) || viewerRole === "ADMIN") return { ...d, viewerRole };
      return {
        ...d,
        viewerRole,
        pickupAddress: viewerRole === "OWNER" ? d.pickupAddress : null,
        owner: { ...d.owner, phone: viewerRole === "OWNER" ? d.owner.phone : null },
        renter: { ...d.renter, phone: viewerRole === "RENTER" ? d.renter.phone : null },
      };
    },

    /** Owner's view of an outfit's calendar (holds and blocks). */
    calendar: (outfitId: string) => queries.calendar(outfitId),
    /** Public: the date ranges an outfit is unavailable, without saying why. */
    async unavailableRanges(outfitId: string) {
      return (await queries.calendar(outfitId)).map((h) => ({
        startsOn: h.startsOn,
        endsBefore: h.endsBefore,
      }));
    },

    /** Condition-report photos are visible to the two people in the rental and administrators. */
    async canViewReportPhoto(actor: Actor, storageKey: string): Promise<boolean> {
      const user = requireUser(actor);
      if (user.isAdmin) return true;
      const bookingId = await queries.bookingIdForReportPhoto(storageKey);
      return bookingId ? queries.isParticipant(user.userId, bookingId) : false;
    },
    holdsCalendar,
  };
}

export type BookingsUseCases = ReturnType<typeof bookingsUseCases>;
