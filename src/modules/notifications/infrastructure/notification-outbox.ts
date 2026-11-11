import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { NotificationOutbox } from "../application/dispatch";

export function prismaNotificationOutbox(db: Db): NotificationOutbox {
  return {
    async claimPendingEmails(limit) {
      return db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            email: string;
            subject: string;
            body: string;
            link: string | null;
            attempts: number;
          }>
        >`
          SELECT n.id, u.email, n.subject, n.body, n.link, n.attempts
          FROM notifications n JOIN users u ON u.id = n.user_id
          WHERE n.status = 'PENDING' AND n.channel = 'EMAIL'
          ORDER BY n.created_at LIMIT ${limit}
          FOR UPDATE OF n SKIP LOCKED`;
        if (rows.length) {
          await tx.notification.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { attempts: { increment: 1 } },
          });
        }
        return rows.map((r) => ({
          id: r.id,
          to: r.email,
          subject: r.subject,
          body: r.body,
          link: r.link,
          attempts: r.attempts,
        }));
      });
    },
    async markSent(id) {
      await db.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    },
    async markFailed(id, error, giveUp) {
      await db.notification.update({
        where: { id },
        data: { lastError: error.slice(0, 500), ...(giveUp ? { status: "FAILED" } : {}) },
      });
    },
  };
}
