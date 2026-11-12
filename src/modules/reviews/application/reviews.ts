import { z } from "zod";
import { marketplacePolicy } from "@/config/marketplace-policy";
import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import type { Clock } from "@/shared/domain/clock";
import { NotFoundError, PreconditionError } from "@/shared/domain/errors";
import { parseInput } from "@/shared/contracts/validation";

export const reviewSchema = z.object({
  bookingId: z.uuid(),
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export interface ReviewableBooking {
  bookingId: string;
  reference: string;
  outfitId: string;
  outfitTitle: string;
  ownerId: string;
  renterId: string;
  ownerName: string;
  renterName: string;
  completedAt: Date;
}

export interface ReviewView {
  id: string;
  bookingId: string;
  outfitTitle: string;
  authorName: string;
  subjectName: string;
  direction: "RENTER_TO_OWNER" | "OWNER_TO_RENTER";
  rating: number;
  comment: string | null;
  visible: boolean;
  createdAt: Date;
}

export interface ReviewRepository {
  completedBooking(bookingId: string): Promise<(ReviewableBooking & { status: string }) | null>;
  hasReviewed(bookingId: string, authorId: string): Promise<boolean>;
  /** Inserts the review; when the other participant has already reviewed, publishes both and updates ratings. */
  insertAndMaybePublish(review: {
    bookingId: string;
    outfitId: string;
    authorId: string;
    subjectId: string;
    direction: "RENTER_TO_OWNER" | "OWNER_TO_RENTER";
    rating: number;
    comment: string | null;
    at: Date;
  }): Promise<{ published: boolean }>;
  /** Publishes reviews whose window has closed without a counterpart review. */
  publishExpired(before: Date): Promise<number>;
  awaitingFrom(userId: string, since: Date): Promise<ReviewableBooking[]>;
  aboutUser(userId: string): Promise<ReviewView[]>;
  byUser(userId: string): Promise<ReviewView[]>;
  forOutfit(outfitId: string): Promise<ReviewView[]>;
}

const DAY_MS = 86_400_000;

/**
 * Verified, double-blind reviews: only the two people in a completed rental may review each other, once
 * each, within the review window. Neither sees the other's review until both have written one or the
 * window closes, so nobody can retaliate.
 */
export function reviewsUseCases({ reviews, clock }: { reviews: ReviewRepository; clock: Clock }) {
  const windowMs = marketplacePolicy.reviewWindowDays * DAY_MS;
  return {
    async submit(actor: Actor, input: unknown) {
      const user = requireUser(actor);
      const data = parseInput(reviewSchema, input);
      const booking = await reviews.completedBooking(data.bookingId);
      if (!booking) throw new NotFoundError("Booking");
      const isRenter = booking.renterId === user.userId;
      const isOwner = booking.ownerId === user.userId;
      if (!isRenter && !isOwner) throw new NotFoundError("Booking");
      if (booking.status !== "COMPLETED")
        throw new PreconditionError("NOT_COMPLETED", "You can review once the rental is complete.");
      const now = clock.now();
      if (now.getTime() - booking.completedAt.getTime() > windowMs) {
        throw new PreconditionError(
          "REVIEW_WINDOW_CLOSED",
          `Reviews can be written within ${marketplacePolicy.reviewWindowDays} days of completion.`,
        );
      }
      if (await reviews.hasReviewed(booking.bookingId, user.userId)) {
        throw new PreconditionError("ALREADY_REVIEWED", "You have already reviewed this rental.");
      }
      return reviews.insertAndMaybePublish({
        bookingId: booking.bookingId,
        outfitId: booking.outfitId,
        authorId: user.userId,
        subjectId: isRenter ? booking.ownerId : booking.renterId,
        direction: isRenter ? "RENTER_TO_OWNER" : "OWNER_TO_RENTER",
        rating: data.rating,
        comment: data.comment ?? null,
        at: now,
      });
    },
    publishExpired: () => reviews.publishExpired(new Date(clock.now().getTime() - windowMs)),
    awaiting: (actor: Actor) =>
      reviews.awaitingFrom(requireUser(actor).userId, new Date(clock.now().getTime() - windowMs)),
    received: (actor: Actor) => reviews.aboutUser(requireUser(actor).userId),
    written: (actor: Actor) => reviews.byUser(requireUser(actor).userId),
    forOutfit: (outfitId: string) => reviews.forOutfit(outfitId),
  };
}

export type ReviewsUseCases = ReturnType<typeof reviewsUseCases>;
