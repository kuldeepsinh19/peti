import "server-only";
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
        const both = await tx.review.findMany({ where: { bookingId: r.bookingId, visibleAt: null } });
        if (both.length < 2) return { published: false };
        await tx.review.updateMany({
          where: { bookingId: r.bookingId, visibleAt: null },
          data: { visibleAt: r.at },
        });
        for (const review of both) await addToAggregates(tx, review);
        return { published: true };
      });
    },

    async publishExpired(before) {
      return db.$transaction(async (tx) => {
        const due = await tx.review.findMany({
          where: { visibleAt: null, booking: { completedAt: { lt: before } } },
        });
        for (const review of due) {
          await tx.review.update({ where: { id: review.id }, data: { visibleAt: new Date() } });
          await addToAggregates(tx, review);
        }
        return due.length;
      });
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
