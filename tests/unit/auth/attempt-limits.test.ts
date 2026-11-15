import { describe, expect, it } from "vitest";
import { AUTH_ACCOUNT_LIMITS, accountAttempts } from "@/modules/auth/application/attempt-limits";

describe("accountAttempts", () => {
  it("limits sign-in per account, whatever the address, ignoring case and spaces", () => {
    expect(accountAttempts("/sign-in/email", { email: "  Rohan@Peti.LOCAL ", password: "x" }, null)).toEqual([
      { rule: AUTH_ACCOUNT_LIMITS.signIn, subject: "rohan@peti.local" },
    ]);
  });

  it("limits password-reset requests per email", () => {
    expect(accountAttempts("/request-password-reset", { email: "a@b.in" }, null)).toEqual([
      { rule: AUTH_ACCOUNT_LIMITS.passwordReset, subject: "a@b.in" },
    ]);
  });

  it("limits one-time codes per phone number and per signed-in user", () => {
    expect(accountAttempts("/phone-number/send-otp", { phoneNumber: "+919000000006" }, "user-1")).toEqual([
      { rule: AUTH_ACCOUNT_LIMITS.otpPhone, subject: "+919000000006" },
      { rule: AUTH_ACCOUNT_LIMITS.otpUser, subject: "user-1" },
    ]);
  });

  it("scales every limit for automated test runs only when asked", () => {
    const [attempt] = accountAttempts("/sign-in/email", { email: "a@b.in" }, null, 20);
    expect(attempt?.rule.limit).toBe(AUTH_ACCOUNT_LIMITS.signIn.limit * 20);
  });

  it("consumes nothing for other paths or malformed bodies", () => {
    expect(accountAttempts("/sign-out", {}, "user-1")).toEqual([]);
    expect(accountAttempts("/sign-in/email", { email: 42 }, null)).toEqual([]);
    expect(accountAttempts("/sign-in/email", null, null)).toEqual([]);
  });
});
