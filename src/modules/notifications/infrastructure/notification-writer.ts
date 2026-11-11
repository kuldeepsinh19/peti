import "server-only";
import type { DbOrTx } from "@/shared/infrastructure/prisma";
import type { NotificationDraft, NotificationWriter } from "../application/ports";

/**
 * Inserts notifications inside the caller's transaction (outbox pattern). In-app rows are immediately
 * SENT; email rows stay PENDING until the sweep delivers them after commit. Duplicate dedupe keys are
 * ignored, so retried transactions never double-notify.
 */
export function prismaNotificationWriter(db: DbOrTx): NotificationWriter {
  return {
    async enqueue(drafts: readonly NotificationDraft[]) {
      const now = new Date();
      const rows = drafts.flatMap((d) =>
        d.channels.map((channel) => ({
          userId: d.userId,
          channel,
          type: d.type,
          subject: d.subject,
          body: d.body,
          link: d.link ?? null,
          dedupeKey: `${d.dedupeKey}:${channel}`,
          status: channel === "IN_APP" ? ("SENT" as const) : ("PENDING" as const),
          sentAt: channel === "IN_APP" ? now : null,
        })),
      );
      if (rows.length > 0) await db.notification.createMany({ data: rows, skipDuplicates: true });
    },
  };
}
