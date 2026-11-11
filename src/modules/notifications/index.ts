export type {
  EmailMessage,
  MailSender,
  NotificationDraft,
  NotificationWriter,
  SmsSender,
} from "./application/ports";
export { notificationEmail, resetPasswordMessage, verifyEmailMessage } from "./application/email-templates";
export { dispatchPendingEmails, type NotificationOutbox, type PendingEmail } from "./application/dispatch";
