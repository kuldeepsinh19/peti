import type { Actor } from "@/shared/application/actor";
import { requireVerifiedContact } from "@/shared/application/authorization";
import { NotFoundError, PreconditionError } from "@/shared/domain/errors";
import { localDate } from "@/shared/domain/local-date";
import { parseInput } from "@/shared/contracts/validation";
import {
  approvalDeadline,
  assertBookableStart,
  bookingReference,
  currentPolicySnapshot,
  holdRange,
  priceBooking,
  rentalDates,
} from "../domain/booking-rules";
import { requestBookingSchema } from "./contracts";
import { DatesUnavailableError } from "./core";
import type { BookingsDeps } from "./ports";

export const BOOKING_REQUEST_LIMIT = { name: "booking-request", limit: 10, windowSeconds: 3600 };

/**
 * A renter asks for dates. Nothing is held and nothing is charged: the owner approves first. The price,
 * deposit and policy are frozen onto the booking now, so later changes never alter this agreement.
 */
export async function requestBooking(deps: BookingsDeps, actor: Actor, input: unknown) {
  const renter = requireVerifiedContact(actor);
  const data = parseInput(requestBookingSchema, input);
  await deps.rateLimiter.consume(BOOKING_REQUEST_LIMIT, renter.userId);
  const now = deps.clock.now();
  const startDate = localDate(data.startDate);
  assertBookableStart(startDate, now);

  return deps.uow.run(async (store) => {
    const outfit = await store.lockOutfit(data.outfitId, false);
    if (!outfit || outfit.status !== "ACTIVE") throw new NotFoundError("Outfit");
    if (outfit.ownerId === renter.userId) {
      throw new PreconditionError("OWN_OUTFIT", "You cannot rent your own outfit.");
    }
    const option = await store.findPriceOption(outfit.id, data.days);
    if (!option)
      throw new PreconditionError("DURATION_NOT_OFFERED", "The owner does not offer that rental length.");

    const dates = rentalDates(startDate, data.days);
    const range = holdRange(dates, outfit.turnaroundDays);
    // Advisory: the exclusion constraint is the authority when the owner approves.
    if (!(await store.isRangeFree(outfit.id, range.startsOn, range.endsBefore)))
      throw new DatesUnavailableError();

    const policy = currentPolicySnapshot();
    const bookingId = await store.insertBooking({
      reference: bookingReference(),
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.userId,
      ...dates,
      bufferDays: outfit.turnaroundDays,
      priceOptionId: option.id,
      pricing: priceBooking(option.pricePaise, outfit.depositPaise, data.days, policy),
      policy,
      termsVersion: policy.version,
      expiresAt: approvalDeadline(now, startDate, policy),
      renterNote: data.note ?? null,
      requestedAt: now,
    });
    const historyId = await store.appendHistory({
      bookingId,
      fromStatus: null,
      toStatus: "PENDING_APPROVAL",
      command: "request",
      actorRole: "RENTER",
      actorUserId: renter.userId,
    });
    await store.notify([
      {
        userId: outfit.ownerId,
        type: "booking.requested",
        subject: `New request: ${outfit.title}`,
        body: `${renter.displayName} would like to rent ${outfit.title} for ${data.days} days from ${data.startDate}. Approve or decline it from your requests.`,
        link: `/lend/requests/${bookingId}`,
        dedupeKey: `${bookingId}:${historyId}:${outfit.ownerId}`,
        channels: ["IN_APP", "EMAIL"],
      },
    ]);
    return { bookingId };
  });
}
