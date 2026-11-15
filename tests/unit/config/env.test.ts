import { describe, expect, it } from "vitest";
import { InvalidEnvironmentError, isDevToolingEnabled, parseEnv } from "@/config/env";

const base = {
  DATABASE_URL: "postgresql://peti:peti@localhost:5432/peti",
  BETTER_AUTH_SECRET: "x".repeat(32),
  SANDBOX_PAYMENT_KEY_SECRET: "sandbox-key",
  SANDBOX_PAYMENT_WEBHOOK_SECRET: "sandbox-webhook",
};

const production = {
  APP_ENV: "production",
  DATABASE_URL: base.DATABASE_URL,
  BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET,
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_test_abc",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  MAIL_DRIVER: "smtp",
  SMTP_URL: "smtp://user:pass@mail.example.com:587",
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "peti",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
  CRON_SECRET: "cron",
  AUTH_IP_HEADERS: "x-real-ip",
};

function issuesFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
    return [];
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error.issues;
    throw error;
  }
}

describe("parseEnv", () => {
  it("accepts a minimal local configuration with sandbox payments", () => {
    const env = parseEnv(base);
    expect(env.APP_ENV).toBe("local");
    expect(env.PAYMENT_PROVIDER).toBe("sandbox");
    expect(isDevToolingEnabled(env)).toBe(true);
  });

  it("requires sandbox secrets when the sandbox provider is selected (no in-code defaults)", () => {
    const issues = issuesFor({ ...base, SANDBOX_PAYMENT_KEY_SECRET: undefined });
    expect(issues.some((i) => i.startsWith("SANDBOX_PAYMENT_KEY_SECRET"))).toBe(true);
  });

  it("refuses production until a real SMS provider exists, and nothing else is missing", () => {
    expect(issuesFor(production)).toEqual([
      "SMS_DRIVER: production requires a real SMS provider (none is implemented yet; see the deployment guide)",
    ]);
  });

  it("accepts a complete staging configuration without dev tooling", () => {
    const env = parseEnv({ ...production, APP_ENV: "staging" });
    expect(isDevToolingEnabled(env)).toBe(false);
  });

  it("fails closed: NODE_ENV=production without APP_ENV is production", () => {
    const issues = issuesFor({ ...base, NODE_ENV: "production" });
    expect(issues).toContain("PAYMENT_PROVIDER: production requires a real payment provider");
  });

  it("rejects placeholder secrets outside local and test", () => {
    const issues = issuesFor({
      ...production,
      APP_ENV: "staging",
      CRON_SECRET: "replace-with-a-random-string",
    });
    expect(issues).toContain("CRON_SECRET: still has the placeholder value from .env.example");
  });

  it("refuses to start production with the sandbox payment provider", () => {
    const issues = issuesFor({ ...production, PAYMENT_PROVIDER: "sandbox", ...pick(base) });
    expect(issues).toContain("PAYMENT_PROVIDER: production requires a real payment provider");
    expect(issues.some((i) => i.includes("sandbox payment secrets must not be set"))).toBe(true);
  });

  it("refuses production with the dev outbox or local-disk storage", () => {
    const issues = issuesFor({ ...production, MAIL_DRIVER: "outbox", STORAGE_DRIVER: "filesystem" });
    expect(issues).toContain("MAIL_DRIVER: production requires real email delivery");
    expect(issues).toContain("STORAGE_DRIVER: production requires object storage");
  });

  it("only accepts Razorpay test-mode keys", () => {
    const issues = issuesFor({ ...production, RAZORPAY_KEY_ID: "rzp_live_abc" });
    expect(issues.some((i) => i.includes("test-mode keys"))).toBe(true);
  });

  describe("client address trust (audit S-02)", () => {
    const staging = { ...production, APP_ENV: "staging" };

    it("requires the proxy's client-address header outside local and test", () => {
      expect(issuesFor({ ...staging, AUTH_IP_HEADERS: undefined })).toContain(
        "AUTH_IP_HEADERS: required: the header your proxy sets with the client address",
      );
    });

    it("only trusts X-Forwarded-For together with the proxies allowed to extend it", () => {
      expect(issuesFor({ ...staging, AUTH_IP_HEADERS: "x-forwarded-for" })).toContain(
        "AUTH_TRUSTED_PROXIES: required when AUTH_IP_HEADERS includes x-forwarded-for",
      );
      expect(
        issuesFor({
          ...staging,
          AUTH_IP_HEADERS: "X-Forwarded-For",
          AUTH_TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.10",
        }),
      ).toEqual([]);
    });

    it("rejects trusted proxies that are not addresses or ranges", () => {
      expect(issuesFor({ ...staging, AUTH_TRUSTED_PROXIES: "10.0.0.0/8,my-load-balancer" })).toContain(
        'AUTH_TRUSTED_PROXIES: "my-load-balancer" is not an IP address or CIDR range',
      );
    });

    it("keeps working locally without any proxy configuration", () => {
      expect(issuesFor(base)).toEqual([]);
    });
  });

  it("rejects a short auth secret", () => {
    const issues = issuesFor({ ...base, BETTER_AUTH_SECRET: "short" });
    expect(issues.some((i) => i.startsWith("BETTER_AUTH_SECRET"))).toBe(true);
  });
});

function pick(source: typeof base) {
  return {
    SANDBOX_PAYMENT_KEY_SECRET: source.SANDBOX_PAYMENT_KEY_SECRET,
    SANDBOX_PAYMENT_WEBHOOK_SECRET: source.SANDBOX_PAYMENT_WEBHOOK_SECRET,
  };
}
