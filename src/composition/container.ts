import "server-only";
import { getEnv, isDevToolingEnabled } from "@/config/env";
import { createAuth } from "@/modules/auth/infrastructure/better-auth";
import type { MailSender, SmsSender } from "@/modules/notifications";
import type { ObjectStorage } from "@/modules/media";
import { sharpImageProcessor } from "@/modules/media/infrastructure/image-processor";
import { filesystemStorage, s3Storage } from "@/modules/media/infrastructure/storage";
import { marketplacePolicy } from "@/config/marketplace-policy";
import {
  outboxMailSender,
  outboxSmsSender,
  smtpMailSender,
} from "@/modules/notifications/infrastructure/senders";
import { listingsUseCases } from "@/modules/listings";
import { storagePhotoStore } from "@/modules/listings/infrastructure/photo-store";
import { prismaListingRepository } from "@/modules/listings/infrastructure/prisma-listing-repository";
import { searchUseCases } from "@/modules/search";
import { prismaCatalogueQueries } from "@/modules/search/infrastructure/catalogue-queries";
import { usersUseCases } from "@/modules/users";
import { prismaUserRepository } from "@/modules/users/infrastructure/prisma-user-repository";
import type { UserActor } from "@/shared/application/actor";
import { systemClock } from "@/shared/domain/clock";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { prismaAuditLog } from "@/shared/infrastructure/audit";
import { postgresRateLimiter } from "@/shared/infrastructure/rate-limiter";

/**
 * Composition root: the only place where adapters are bound to ports. Built lazily once per process from
 * validated configuration, so importing a page never requires a database at build time.
 */
function build() {
  const env = getEnv();
  const db = getPrisma();
  const clock = systemClock;

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

  return {
    env,
    db,
    clock,
    mail,
    sms,
    auth,
    storage,
    images,
    /**
     * Who may see private photos (condition reports, dispute evidence). Administrators always; booking
     * participants are added by the bookings module once it exists.
     */
    fileAccess: {
      canView: async (actor: UserActor, _key: string) => actor.isAdmin,
    },
    devTooling: isDevToolingEnabled(env),
    rateLimiter: postgresRateLimiter(db, clock),
    users: usersUseCases({ users: prismaUserRepository(db) }),
    listings: listingsUseCases({
      listings: prismaListingRepository(db),
      photos: storagePhotoStore(storage, images),
      audit: prismaAuditLog(db),
      clock,
    }),
    search: searchUseCases({ catalogue: prismaCatalogueQueries(db), clock }),
  };
}

export type Container = ReturnType<typeof build>;

const globalForContainer = globalThis as unknown as { petiContainer?: Container };

export function container(): Container {
  globalForContainer.petiContainer ??= build();
  return globalForContainer.petiContainer;
}
