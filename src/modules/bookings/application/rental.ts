import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { HOUR_MS } from "@/shared/domain/clock";
import { PreconditionError, ValidationError } from "@/shared/domain/errors";
import { addDays, localDate, localDateInIndia } from "@/shared/domain/local-date";
import { parseInput } from "@/shared/contracts/validation";
import { lateReturn } from "../domain/booking-rules";
import { acknowledgeSchema, bookingIdSchema, conditionReportSchema } from "./contracts";
import { applyTransition, loadBooking, requireRole, settleMoney } from "./core";
import type { BookingsDeps } from "./ports";

export const MAX_REPORT_PHOTOS = 10;

async function storePhotos(deps: BookingsDeps, bookingId: string, photos: Uint8Array[]) {
  if (photos.length > MAX_REPORT_PHOTOS) {
    throw new ValidationError(`Upload at most ${MAX_REPORT_PHOTOS} photographs.`, {
      photos: ["Too many photographs."],
    });
  }
  const keys: string[] = [];
  // Photos are sanitised and stored before the transaction; an aborted report leaves only orphaned files.
  for (const bytes of photos) keys.push(await deps.reportPhotos.save(bookingId, bytes));
  return keys;
}

/**
 * The owner records the outfit's condition at handover (at least the policy's minimum number of photos).
 * Allowed from the day before the start date until the renter acknowledges it.
 */
export async function submitHandoverReport(
  deps: BookingsDeps,
  actor: Actor,
  input: unknown,
  photos: Uint8Array[],
) {
  const data = parseInput(conditionReportSchema, input);
  const now = deps.clock.now();
  const precheck = await deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId, false);
    requireRole(booking, actor, ["OWNER"]);
    if (booking.status !== "CONFIRMED")
      throw new PreconditionError("NOT_CONFIRMED", "Handover is recorded once the booking is paid.");
    if (localDateInIndia(now) < addDays(booking.startDate, -1)) {
      throw new PreconditionError(
        "TOO_EARLY",
        "You can record the handover from the day before the rental starts.",
      );
    }
    const existing = await store.getConditionReport(booking.id, "HANDOVER");
    if (existing?.acknowledgedAt)
      throw new PreconditionError("REPORT_LOCKED", "The renter has already acknowledged the handover.");
    return booking;
  });
  if (photos.length < precheck.policy.minConditionPhotos) {
    throw new ValidationError(`Add at least ${precheck.policy.minConditionPhotos} photographs.`, {
      photos: [`At least ${precheck.policy.minConditionPhotos} photographs are required.`],
    });
  }
  const keys = await storePhotos(deps, data.bookingId, photos);
  await deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId);
    if (booking.status !== "CONFIRMED")
      throw new PreconditionError("NOT_CONFIRMED", "This booking changed. Please reload.");
    await store.saveConditionReport({
      bookingId: booking.id,
      kind: "HANDOVER",
      authorId: requireUser(actor).userId,
      grade: data.grade,
      notes: data.notes,
      photos: keys.map((storageKey) => ({ storageKey, caption: null })),
    });
  });
}

/** The renter checks the outfit in person and acknowledges the owner's handover report: CONFIRMED → ACTIVE. */
export async function acknowledgeHandover(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId, notes } = parseInput(acknowledgeSchema, input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["RENTER", "ADMIN"]);
    const report = await store.getConditionReport(booking.id, "HANDOVER");
    if (!report || report.photoCount < booking.policy.minConditionPhotos) {
      throw new PreconditionError("NO_HANDOVER_REPORT", "The owner has not recorded the handover yet.");
    }
    if (localDateInIndia(now) < addDays(booking.startDate, -1)) {
      throw new PreconditionError(
        "TOO_EARLY",
        "Handover can be acknowledged from the day before the rental starts.",
      );
    }
    const userId = requireUser(actor).userId;
    await store.acknowledgeReport(report.id, userId, now, notes ?? null);
    await applyTransition(store, booking, "acknowledgeHandover", role, {
      actorUserId: userId,
      patch: { handedOverAt: now },
    });
  });
}

/**
 * The owner records the return with photographs: ACTIVE → RETURNED. Late days are computed against the
 * end date and the late fee (capped at the deposit) is fixed now; the inspection window starts.
 */
export async function recordReturn(deps: BookingsDeps, actor: Actor, input: unknown, photos: Uint8Array[]) {
  const data = parseInput(conditionReportSchema, input);
  const now = deps.clock.now();
  const today = localDateInIndia(now);
  const returnedOn = data.returnedOn ? localDate(data.returnedOn) : today;
  if (returnedOn > today)
    throw new ValidationError("The return date cannot be in the future.", {
      returnedOn: ["Not in the future."],
    });

  const precheck = await deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId, false);
    requireRole(booking, actor, ["OWNER", "ADMIN"]);
    if (booking.status !== "ACTIVE")
      throw new PreconditionError("NOT_ACTIVE", "Only an outfit that is with the renter can be returned.");
    return booking;
  });
  if (returnedOn < precheck.startDate) {
    throw new ValidationError("The return date cannot be before the rental started.", {
      returnedOn: ["Too early."],
    });
  }
  if (photos.length < precheck.policy.minConditionPhotos) {
    throw new ValidationError(`Add at least ${precheck.policy.minConditionPhotos} photographs.`, {
      photos: [`At least ${precheck.policy.minConditionPhotos} photographs are required.`],
    });
  }
  const keys = await storePhotos(deps, data.bookingId, photos);

  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, data.bookingId);
    const role = requireRole(booking, actor, ["OWNER", "ADMIN"]);
    const userId = requireUser(actor).userId;
    const late = lateReturn(booking.endDate, returnedOn, booking.lateFeePerDayPaise, booking.depositPaise);
    await store.saveConditionReport({
      bookingId: booking.id,
      kind: "RETURN",
      authorId: userId,
      grade: data.grade,
      notes: data.notes,
      photos: keys.map((storageKey) => ({ storageKey, caption: null })),
    });
    await applyTransition(store, booking, "recordReturn", role, {
      actorUserId: userId,
      patch: {
        returnedAt: now,
        returnedOn,
        lateDays: late.lateDays,
        lateFeePaise: late.lateFeePaise,
        inspectionDeadline: new Date(now.getTime() + booking.policy.inspectionWindowHours * HOUR_MS),
      },
    });
    return late;
  });
}

/** The owner confirms the outfit came back as it left: RETURNED → COMPLETED, with settlement. */
export async function confirmReturn(deps: BookingsDeps, actor: Actor, input: unknown) {
  const { bookingId } = parseInput(bookingIdSchema, input);
  const now = deps.clock.now();
  return deps.uow.run(async (store) => {
    const booking = await loadBooking(store, bookingId);
    const role = requireRole(booking, actor, ["OWNER", "ADMIN"]);
    const userId = requireUser(actor).userId;
    if (await store.hasOpenDispute(booking.id))
      throw new PreconditionError("DISPUTE_OPEN", "A dispute is open on this booking.");
    await settleMoney(store, booking, {
      retainedFeePaise: booking.rentalFeePaise,
      lateFeePaise: booking.lateFeePaise ?? 0,
      damagePaise: 0,
      basis: "OWNER_CONFIRMED",
      refundReason: "DEPOSIT_RELEASE",
      role,
      actorUserId: userId,
      at: now,
    });
    await applyTransition(store, booking, "confirmReturn", role, {
      actorUserId: userId,
      patch: { completedAt: now, inspectionDeadline: null },
    });
  });
}
