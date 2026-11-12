import "server-only";
import { getEnv, isDevToolingEnabled } from "@/config/env";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { adminUseCases } from "@/modules/admin";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { createAuth } from "@/modules/auth/infrastructure/better-auth";
import { bookingsUseCases } from "@/modules/bookings";
import { prismaBookingQueries } from "@/modules/bookings/infrastructure/booking-queries";
import { prismaBookingStore } from "@/modules/bookings/infrastructure/prisma-booking-store";
import { storageReportPhotoStore } from "@/modules/bookings/infrastructure/report-photo-store";
import { listingsUseCases } from "@/modules/listings";
import { storagePhotoStore } from "@/modules/listings/infrastructure/photo-store";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import type { ObjectStorage } from "@/modules/media";
import { sharpImageProcessor } from "@/modules/media/infrastructure/image-processor";
import { filesystemStorage, s3Storage } from "@/modules/media/infrastructure/storage";
import {
  dispatchPendingEmails,
  inboxUseCases,
  type MailSender,
  type SmsSender,
} from "@/modules/notifications";
import { prismaInboxRepository } from "@/modules/notifications/infrastructure/inbox-repository";
import { prismaNotificationOutbox } from "@/modules/notifications/infrastructure/notification-outbox";
import { prismaNotificationWriter } from "@/modules/notifications/infrastructure/notification-writer";
import {
  outboxMailSender,
  outboxSmsSender,
  smtpMailSender,
} from "@/modules/notifications/infrastructure/senders";
import { type PaymentProvider, paymentsUseCases, type PaymentsUseCases } from "@/modules/payments";
import { prismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";
import { razorpayProvider } from "@/modules/payments/infrastructure/razorpay-provider";
import { type SandboxProvider, sandboxProvider } from "@/modules/payments/infrastructure/sandbox-provider";
import { reviewsUseCases } from "@/modules/reviews";
import { prismaReviewRepository } from "@/modules/reviews/infrastructure/prisma-review-repository";
import { searchUseCases } from "@/modules/search";
import { prismaCatalogueQueries } from "@/modules/search/infrastructure/catalogue-queries";
import { usersUseCases } from "@/modules/users";
import { prismaUserRepository } from "@/modules/users/infrastructure/prisma-user-repository";
import type { UserActor } from "@/shared/application/actor";
import { systemClock } from "@/shared/domain/clock";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { postgresRateLimiter } from "@/shared/infrastructure/rate-limiter";
import { prismaUnitOfWork } from "@/shared/infrastructure/unit-of-work";

/**
 * Composition root: the only place where adapters are bound to ports. Built lazily once per process from
 * validated configuration, so importing a page never requires a database at build time.
 */
function build() {
  const env = getEnv();
  const db = getPrisma();
  const clock = systemClock;
  const devTooling = isDevToolingEnabled(env);

  const mail: MailSender =
    env.MAIL_DRIVER === "smtp" && env.SMTP_URL
      ? smtpMailSender(env.SMTP_URL, env.MAIL_FROM)
      : outboxMailSender(db);
  const sms: SmsSender = outboxSmsSender(db);
  const auth = createAuth({ env, db, mail, sms });

  const storage: ObjectStorage =
    env.STORAGE_DRIVER === "s3"
      ? s3Storage({
          bucket: env.S3_BUCKET!,
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        })
      : filesystemStorage(env.STORAGE_FS_ROOT);
  const images = sharpImageProcessor(marketplacePolicy.maxUploadBytes);
  const rateLimiter = postgresRateLimiter(db, clock);

  // Payment provider registry. The sandbox exists only where dev tooling is enabled (local/test); env.ts
  // additionally refuses to boot production with it.
  let sandbox: SandboxProvider | null = null;
  let provider: PaymentProvider;
  if (env.PAYMENT_PROVIDER === "sandbox") {
    if (!devTooling)
      throw new Error("The sandbox payment provider is only available when APP_ENV is local or test.");
    sandbox = sandboxProvider(db, {
      keySecret: env.SANDBOX_PAYMENT_KEY_SECRET!,
      webhookSecret: env.SANDBOX_PAYMENT_WEBHOOK_SECRET!,
    });
    provider = sandbox.provider;
  } else {
    provider = razorpayProvider({
      keyId: env.RAZORPAY_KEY_ID!,
      keySecret: env.RAZORPAY_KEY_SECRET!,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET!,
    });
  }

  // Bookings and payments refer to each other at run time only (reconcile before expiry ↔ confirm on
  // capture); late binding keeps module dependencies one-way: payments → bookings.
  let payments: PaymentsUseCases | null = null;
  const bookings = bookingsUseCases({
    uow: prismaUnitOfWork(db, (tx) => prismaBookingStore(tx, prismaNotificationWriter(tx))),
    clock,
    rateLimiter,
    reportPhotos: storageReportPhotoStore(storage, images),
    queries: prismaBookingQueries(db),
    paymentReconciler: { reconcile: (bookingId) => payments?.reconcile(bookingId) ?? Promise.resolve() },
  });
  payments = paymentsUseCases({
    provider,
    payments: prismaPaymentRepository(db),
    bookings,
    clock,
    appUrl: env.APP_URL,
  });
  const paymentsRef = payments;
  const reviews = reviewsUseCases({ reviews: prismaReviewRepository(db), clock });

  return {
    env,
    db,
    clock,
    mail,
    sms,
    auth,
    storage,
    images,
    devTooling,
    rateLimiter,
    sandbox,
    /** Private photos (condition reports): administrators and the two people in the rental only. */
    fileAccess: {
      canView: (actor: UserActor, key: string) => bookings.canViewReportPhoto(actor, key),
    },
    users: usersUseCases({ users: prismaUserRepository(db) }),
    listings: listingsUseCases({
      listings: prismaListingRepository(db),
      photos: storagePhotoStore(storage, images),
      audit: prismaAuditLog(db),
      clock,
    }),
    search: searchUseCases({ catalogue: prismaCatalogueQueries(db), clock }),
    bookings,
    payments: paymentsRef,
    reviews,
    inbox: inboxUseCases({ inbox: prismaInboxRepository(db), clock }),
    admin: adminUseCases({ admin: prismaAdminRepository(db), audit: prismaAuditLog(db), clock }),
    /** Background work: deadlines, refunds and emails. Idempotent and safe to run concurrently. */
    async sweep() {
      const bookingReport = await bookings.sweep();
      const refunds = await paymentsRef.dispatchRefunds();
      const emails = await dispatchPendingEmails(prismaNotificationOutbox(db), mail, env.APP_URL);
      const reviewsPublished = await reviews.publishExpired();
      return { bookings: bookingReport, refunds, emails, reviewsPublished };
    },
  };
}

export type Container = ReturnType<typeof build>;

const globalForContainer = globalThis as unknown as { petiContainer?: Container };

export function container(): Container {
  globalForContainer.petiContainer ??= build();
  return globalForContainer.petiContainer;
}
