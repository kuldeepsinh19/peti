import type { RateLimitRule } from "@/shared/application/rate-limiter";

/**
 * Per-account limits on authentication attempts. Better Auth's own limits are keyed on the client IP,
 * which a client can influence wherever forwarded headers are not set by a trusted proxy. These are keyed
 * on the account being attacked (email, phone number or signed-in user), so rotating addresses does not
 * help an attacker guess one account's password or flood one phone number with codes.
 */
export const AUTH_ACCOUNT_LIMITS = {
  signIn: { name: "auth-sign-in-account", limit: 20, windowSeconds: 15 * 60 },
  passwordReset: { name: "auth-password-reset-account", limit: 5, windowSeconds: 60 * 60 },
  otpPhone: { name: "auth-otp-phone", limit: 5, windowSeconds: 60 * 60 },
  otpUser: { name: "auth-otp-user", limit: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface AuthAttempt {
  rule: RateLimitRule;
  subject: string;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim().toLowerCase() : null;

/**
 * Which per-account limits an auth request consumes. `scale` loosens every limit (automated test runs
 * only); `userId` is the signed-in user, when there is one.
 */
export function accountAttempts(
  path: string,
  body: unknown,
  userId: string | null,
  scale = 1,
): AuthAttempt[] {
  const fields = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const scaled = (rule: RateLimitRule): RateLimitRule => ({ ...rule, limit: rule.limit * scale });
  const attempts: AuthAttempt[] = [];

  if (path === "/sign-in/email") {
    const email = text(fields.email);
    if (email) attempts.push({ rule: scaled(AUTH_ACCOUNT_LIMITS.signIn), subject: email });
  } else if (path === "/request-password-reset") {
    const email = text(fields.email);
    if (email) attempts.push({ rule: scaled(AUTH_ACCOUNT_LIMITS.passwordReset), subject: email });
  } else if (path === "/phone-number/send-otp") {
    const phone = text(fields.phoneNumber);
    if (phone) attempts.push({ rule: scaled(AUTH_ACCOUNT_LIMITS.otpPhone), subject: phone });
    if (userId) attempts.push({ rule: scaled(AUTH_ACCOUNT_LIMITS.otpUser), subject: userId });
  }
  return attempts;
}
