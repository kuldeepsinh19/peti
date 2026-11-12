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
  /**
   * Locks up to `limit` pending email notifications (SKIP LOCKED), hands each to `send` while the lock is
   * held, and records the outcome in the same transaction, so two sweeps can never send the same email.
   */
  processPendingEmails(
    limit: number,
    send: (email: PendingEmail) => Promise<void>,
  ): Promise<{ claimed: number; sent: number }>;
}

/** Delivers queued notification emails after the business transaction committed. */
export function dispatchPendingEmails(
  outbox: NotificationOutbox,
  mail: MailSender,
  appUrl: string,
  limit = 50,
) {
  return outbox.processPendingEmails(limit, async (n) => {
    await mail.send(notificationEmail(n.to, n.subject, n.body, n.link ? appUrl + n.link : undefined));
  });
}
