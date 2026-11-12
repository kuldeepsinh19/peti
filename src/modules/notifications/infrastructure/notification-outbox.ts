import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { NotificationOutbox } from "../application/dispatch";

const MAX_ATTEMPTS = 5;

type Row = {
  id: string;
  email: string;
  subject: string;
  body: string;
  link: string | null;
  attempts: number;
};

export function prismaNotificationOutbox(db: Db): NotificationOutbox {
  return {
    processPendingEmails(limit, send) {
      return db.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Row[]>`
            SELECT n.id, u.email, n.subject, n.body, n.link, n.attempts
            FROM notifications n JOIN users u ON u.id = n.user_id
            WHERE n.status = 'PENDING' AND n.channel = 'EMAIL'
            ORDER BY n.created_at
            LIMIT ${limit}
            FOR UPDATE OF n SKIP LOCKED`;
          let sent = 0;
          for (const r of rows) {
            try {
              await send({
                id: r.id,
                to: r.email,
                subject: r.subject,
                body: r.body,
                link: r.link,
                attempts: r.attempts,
              });
              await tx.notification.update({
                where: { id: r.id },
                data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
              });
              sent++;
            } catch (error) {
              await tx.notification.update({
                where: { id: r.id },
                data: {
                  attempts: { increment: 1 },
                  lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
                  ...(r.attempts + 1 >= MAX_ATTEMPTS ? { status: "FAILED" as const } : {}),
                },
              });
            }
          }
          return { claimed: rows.length, sent };
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    },
  };
}
