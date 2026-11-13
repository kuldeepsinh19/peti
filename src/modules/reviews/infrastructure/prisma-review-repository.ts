import "server-only";
import { PreconditionError } from "@/shared/domain/errors";
import type { Db, Tx } from "@/shared/infrastructure/prisma";
import type { ReviewRepository, ReviewView } from "../application/reviews";

const name = (u: { name: string; profile: { displayName: string } | null }) =>
  u.profile?.displayName ?? u.name;
const person = { select: { name: true, profile: { select: { displayName: true } } } } as const;

/** Adds a now-visible review to the subject's integer rating aggregates. */
async function addToAggregates(tx: Tx, review: { subjectId: string; direction: string; rating: number }) {
  await tx.userProfile.update({
    where: { userId: review.subjectId },
    data:
      review.direction === "RENTER_TO_OWNER"
        ? { ownerRatingSum: { increment: review.rating }, ownerRatingCount: { increment: 1 } }
        : { renterRatingSum: { increment: review.rating }, renterRatingCount: { increment: 1 } },
  });
}

const lockBooking = (tx: Tx, bookingId: string) =>
  tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR NO KEY UPDATE`;

/**
 * Publishes a booking's hidden reviews and adds exactly the reviews this statement published to the
 * ratings, so a review can never be counted twice (another sweep, or the second submission, finds nothing).
 */
async function publishBooking(tx: Tx, bookingId: string, at: Date): Promise<number> {
  const published = await tx.$queryRaw<Array<{ subject_id: string; direction: string; rating: number }>>`
    UPDATE reviews SET visible_at = ${at}
    WHERE booking_id = ${bookingId}::uuid AND visible_at IS NULL
    RETURNING subject_id, direction::text AS direction, rating`;
  for (const p of published) {
    await addToAggregates(tx, { subjectId: p.subject_id, direction: p.direction, rating: p.rating });
  }
  return published.length;
}

export function prismaReviewRepository(db: Db): ReviewRepository {
  const toView = (r: {
    id: string;
    bookingId: string;
    direction: "RENTER_TO_OWNER" | "OWNER_TO_RENTER";
    rating: number;
    comment: string | null;
    visibleAt: Date | null;
    createdAt: Date;
    author: { name: string; profile: { displayName: string } | null };
    subject: { name: string; profile: { displayName: string } | null };
    outfit: { title: string };
  }): ReviewView => ({
    id: r.id,
    bookingId: r.bookingId,
    outfitTitle: r.outfit.title,
    authorName: name(r.author),
    subjectName: name(r.subject),
    direction: r.direction,
    rating: r.rating,
    comment: r.comment,
    visible: r.visibleAt !== null,
    createdAt: r.createdAt,
  });
  const include = { author: person, subject: person, outfit: { select: { title: true } } } as const;

  return {
    async completedBooking(bookingId) {
      const b = await db.booking.findUnique({
        where: { id: bookingId },
        include: { outfit: { select: { title: true } }, owner: person, renter: person },
      });
      if (!b || !b.completedAt) return null;
      return {
        bookingId: b.id,
        reference: b.reference,
        outfitId: b.outfitId,
        outfitTitle: b.outfit.title,
        ownerId: b.ownerId,
        renterId: b.renterId,
        ownerName: name(b.owner),
        renterName: name(b.renter),
        completedAt: b.completedAt,
        status: b.status,
      };
    },

    hasReviewed: async (bookingId, authorId) =>
      (await db.review.count({ where: { bookingId, authorId } })) > 0,

    async insertAndMaybePublish(r) {
      return db.$transaction(async (tx) => {
        // Serialise everything that touches this booking's reviews: two people submitting at the same moment
        // must see each other's review, and a double submit must not reach the unique index.
        await lockBooking(tx, r.bookingId);
        if ((await tx.review.count({ where: { bookingId: r.bookingId, authorId: r.authorId } })) > 0) {
          throw new PreconditionError("ALREADY_REVIEWED", "You have already reviewed this rental.");
        }
        await tx.review.create({
          data: {
            bookingId: r.bookingId,
            outfitId: r.outfitId,
            authorId: r.authorId,
            subjectId: r.subjectId,
            direction: r.direction,
            rating: r.rating,
            comment: r.comment,
          },
        });
        const waiting = await tx.review.count({ where: { bookingId: r.bookingId, visibleAt: null } });
        if (waiting < 2) return { published: false };
        await publishBooking(tx, r.bookingId, r.at);
        return { published: true };
      });
    },

    async publishExpired(before) {
      const due = await db.$queryRaw<Array<{ booking_id: string }>>`
        SELECT DISTINCT r.booking_id FROM reviews r JOIN bookings b ON b.id = r.booking_id
        WHERE r.visible_at IS NULL AND b.completed_at < ${before}`;
      let published = 0;
      for (const { booking_id } of due) {
        published += await db.$transaction(async (tx) => {
          await lockBooking(tx, booking_id);
          return publishBooking(tx, booking_id, new Date());
        });
      }
      return published;
    },

    async awaitingFrom(userId, since) {
      const rows = await db.booking.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: since },
          OR: [{ ownerId: userId }, { renterId: userId }],
          reviews: { none: { authorId: userId } },
        },
        include: { outfit: { select: { title: true } }, owner: person, renter: person },
        orderBy: { completedAt: "desc" },
      });
      return rows.map((b) => ({
        bookingId: b.id,
        reference: b.reference,
        outfitId: b.outfitId,
        outfitTitle: b.outfit.title,
        ownerId: b.ownerId,
        renterId: b.renterId,
        ownerName: name(b.owner),
        renterName: name(b.renter),
        completedAt: b.completedAt!,
      }));
    },

    async aboutUser(userId) {
      const rows = await db.review.findMany({
        where: { subjectId: userId, visibleAt: { not: null } },
        include,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toView);
    },

    async byUser(userId) {
      const rows = await db.review.findMany({
        where: { authorId: userId },
        include,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toView);
    },

    async forOutfit(outfitId) {
      const rows = await db.review.findMany({
        where: { outfitId, direction: "RENTER_TO_OWNER", visibleAt: { not: null } },
        include,
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return rows.map(toView);
    },
  };
}
