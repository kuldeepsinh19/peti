import { notificationEmail } from "./email-templates";
import type { MailSender } from "./ports";

export interface PendingEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  attempts: number;
}

export interface NotificationOutbox {
  claimPendingEmails(limit: number): Promise<PendingEmail[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string, giveUp: boolean): Promise<void>;
}

/** Delivers queued notification emails after the business transaction committed. */
export async function dispatchPendingEmails(
  outbox: NotificationOutbox,
  mail: MailSender,
  appUrl: string,
  limit = 50,
) {
  const pending = await outbox.claimPendingEmails(limit);
  let sent = 0;
  for (const n of pending) {
    try {
      await mail.send(notificationEmail(n.to, n.subject, n.body, n.link ? `${appUrl}${n.link}` : undefined));
      await outbox.markSent(n.id);
      sent++;
    } catch (error) {
      await outbox.markFailed(
        n.id,
        error instanceof Error ? error.message : String(error),
        n.attempts + 1 >= 5,
      );
    }
  }
  return { claimed: pending.length, sent };
}
