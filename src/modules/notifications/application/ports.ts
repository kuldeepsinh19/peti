/** Delivery channels. Local and test environments bind these to the dev outbox; production to SMTP/SMS. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface SmsSender {
  /** `to` is an E.164 Indian mobile number (+91…). */
  send(to: string, text: string): Promise<void>;
}

/** Business events that notify a user. Written inside the business transaction, delivered later. */
export interface NotificationDraft {
  userId: string;
  type: string;
  subject: string;
  body: string;
  link?: string;
  /** Makes the insert idempotent, e.g. `${bookingId}:${historyId}:${userId}`. */
  dedupeKey: string;
  channels: ReadonlyArray<"IN_APP" | "EMAIL">;
}

export interface NotificationWriter {
  enqueue(drafts: readonly NotificationDraft[]): Promise<void>;
}
