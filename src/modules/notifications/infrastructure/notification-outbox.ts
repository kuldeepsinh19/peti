import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { NotificationOutbox, PendingEmail } from "../application/dispatch";

const MAX_ATTEMPTS = 5;

type Row = {
  id: string;
  email: string;
  subject: string;
  body: string;
  link: string | null;
  attempts: number;
};

/**
 * Each email is handled in its own short transaction: lock one pending row (SKIP LOCKED, so concurrent
 * sweeps take different rows), send it, record the outcome, commit. A slow or failing send only ever
 * affects that one email; the SMTP sender's own timeouts are well under the transaction timeout, so a
 * hung server ends as a recorded failed attempt instead of rolling back other emails' results.
 */
export function prismaNotificationOutbox(db: Db): NotificationOutbox {
  /** `tried` holds ids this run already attempted, so a failing email waits for the next run. */
  async function processOne(send: (email: PendingEmail) => Promise<void>, tried: string[]) {
    return db.$transaction(
      async (tx) => {
        const [r] = await tx.$queryRaw<Row[]>`
          SELECT n.id, u.email, n.subject, n.body, n.link, n.attempts
          FROM notifications n JOIN users u ON u.id = n.user_id
          WHERE n.status = 'PENDING' AND n.channel = 'EMAIL' AND NOT (n.id = ANY(${tried}::uuid[]))
          ORDER BY n.created_at
          LIMIT 1
          FOR UPDATE OF n SKIP LOCKED`;
        if (!r) return { outcome: "none" as const };
        tried.push(r.id);
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
          return { outcome: "sent" as const };
        } catch (error) {
          await tx.notification.update({
            where: { id: r.id },
            data: {
              attempts: { increment: 1 },
              lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
              ...(r.attempts + 1 >= MAX_ATTEMPTS ? { status: "FAILED" as const } : {}),
            },
          });
          return { outcome: "failed" as const };
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  return {
    async processPendingEmails(limit, send) {
      const tried: string[] = [];
      let sent = 0;
      while (tried.length < limit) {
        const { outcome } = await processOne(send, tried);
        if (outcome === "none") break;
        if (outcome === "sent") sent++;
      }
      const claimed = tried.length;
      return { claimed, sent };
    },
  };
}
