import "server-only";
import nodemailer from "nodemailer";
import type { Db } from "@/shared/infrastructure/prisma";
import type { EmailMessage, MailSender, SmsSender } from "../application/ports";

/**
 * Dev outbox: stores messages in the database instead of sending them, and shows them at /dev/outbox.
 * Only bound when APP_ENV is local or test (env.ts refuses MAIL_DRIVER=outbox in production).
 */
export function outboxMailSender(db: Db): MailSender {
  return {
    async send(message: EmailMessage) {
      await db.devOutboxMessage.create({
        data: {
          channel: "EMAIL",
          recipient: message.to.toLowerCase(),
          subject: message.subject,
          body: message.text,
        },
      });
    },
  };
}

export function outboxSmsSender(db: Db): SmsSender {
  return {
    async send(to: string, text: string) {
      await db.devOutboxMessage.create({ data: { channel: "SMS", recipient: to, body: text } });
    },
  };
}

export function smtpMailSender(smtpUrl: string, from: string): MailSender {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(message: EmailMessage) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    },
  };
}
