import type { EmailMessage } from "./ports";

/** Plain, honest transactional emails. Kept as text first; HTML mirrors it without tracking pixels. */
function wrap(
  to: string,
  subject: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): EmailMessage {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    "",
    "— Peti, Ahmedabad",
  ].join("\n\n");
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = [
    `<div style="font-family:Georgia,serif;color:#1e1b18;max-width:32rem">`,
    ...paragraphs.map((p) => `<p>${escape(p)}</p>`),
    action ? `<p><a href="${escape(action.url)}" style="color:#6b1f2a">${escape(action.label)}</a></p>` : "",
    `<p style="color:#6f675e">— Peti, Ahmedabad</p></div>`,
  ].join("");
  return { to, subject, text, html };
}

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  return wrap(
    to,
    "Confirm your email for Peti",
    [
      `Hello ${name},`,
      "Please confirm this email address so you can rent and lend outfits on Peti. The link expires in one hour.",
    ],
    { label: "Confirm email", url },
  );
}

export function resetPasswordMessage(to: string, name: string, url: string): EmailMessage {
  return wrap(
    to,
    "Reset your Peti password",
    [
      `Hello ${name},`,
      "Someone asked to reset the password for this account. If it was you, use the link below. It expires in one hour.",
      "If it was not you, ignore this email — your password will not change.",
    ],
    { label: "Choose a new password", url },
  );
}

export function notificationEmail(to: string, subject: string, body: string, url?: string): EmailMessage {
  return wrap(to, subject, [body], url ? { label: "Open in Peti", url } : undefined);
}
