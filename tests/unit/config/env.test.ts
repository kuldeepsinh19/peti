import { describe, expect, it } from "vitest";
import {
  InvalidEnvironmentError,
  allowsPhotoUploads,
  allowsSandboxPayments,
  allowsSelfServiceAccounts,
  devRouteAllowed,
  isDevToolingEnabled,
  parseEnv,
} from "@/config/env";

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

  it("refuses production with the SMS dev outbox, and nothing else is missing", () => {
    expect(issuesFor(production)).toEqual([
      "SMS_DRIVER: production requires a real SMS provider (SMS_DRIVER=msg91; see sms-otp.md)",
    ]);
  });

  it("accepts production with the MSG91 SMS provider, which needs its key and template", () => {
    const msg91 = { ...production, SMS_DRIVER: "msg91" };
    expect(issuesFor(msg91)).toEqual([
      "MSG91_AUTH_KEY: required when SMS_DRIVER=msg91",
      "MSG91_OTP_TEMPLATE_ID: required when SMS_DRIVER=msg91",
    ]);
    const env = parseEnv({ ...msg91, MSG91_AUTH_KEY: "key", MSG91_OTP_TEMPLATE_ID: "tpl" });
    expect(env).toMatchObject({ SMS_DRIVER: "msg91", MSG91_OTP_VARIABLE: "OTP" });
    // The variable name becomes a JSON key in the provider request: letters, digits and underscores only.
    expect(
      issuesFor({
        ...msg91,
        MSG91_AUTH_KEY: "key",
        MSG91_OTP_TEMPLATE_ID: "tpl",
        MSG91_OTP_VARIABLE: "mobiles ",
      }),
    ).toHaveLength(1);
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

  describe("public demo (APP_ENV=demo)", () => {
    const demo = {
      ...base,
      APP_ENV: "demo",
      SANDBOX_PAYMENT_KEY_SECRET: "a-real-random-sandbox-key",
      SANDBOX_PAYMENT_WEBHOOK_SECRET: "a-real-random-sandbox-webhook",
      CRON_SECRET: "a-real-random-cron-secret",
      AUTH_IP_HEADERS: "x-real-ip",
    };

    it("allows sandbox payments but no developer tooling and no self-service accounts", () => {
      const env = parseEnv(demo);
      expect(allowsSandboxPayments(env)).toBe(true);
      expect(isDevToolingEnabled(env)).toBe(false);
      expect(allowsSelfServiceAccounts(env)).toBe(false);
    });

    it("exposes the sandbox checkout but never the developer outbox", () => {
      const env = parseEnv(demo);
      expect(devRouteAllowed("/dev/sandbox-checkout/order_sb_1", env)).toBe(true);
      expect(devRouteAllowed("/dev/outbox", env)).toBe(false);
      expect(devRouteAllowed("/dev/design-system", env)).toBe(false);
      expect(devRouteAllowed("/dev/sandbox-checkout-evil", env)).toBe(false);
    });

    it("requires a cron secret, the client-address header and the sandbox provider", () => {
      const issues = issuesFor({ ...demo, CRON_SECRET: undefined, AUTH_IP_HEADERS: undefined });
      expect(issues).toContain("CRON_SECRET: required in the demo");
      expect(issues.some((i) => i.startsWith("AUTH_IP_HEADERS"))).toBe(true);
      expect(issuesFor({ ...demo, ...production, APP_ENV: "demo" })).toContain(
        "PAYMENT_PROVIDER: the demo uses the sandbox provider only",
      );
    });

    it("rejects the placeholder secrets from .env.example", () => {
      expect(issuesFor({ ...demo, SANDBOX_PAYMENT_KEY_SECRET: "replace-with-a-random-string" })).toContain(
        "SANDBOX_PAYMENT_KEY_SECRET: still has the placeholder value from .env.example",
      );
    });

    it("keeps everything on in local and test", () => {
      const env = parseEnv(base);
      expect([allowsSandboxPayments(env), isDevToolingEnabled(env), allowsSelfServiceAccounts(env)]).toEqual([
        true,
        true,
        true,
      ]);
      expect(devRouteAllowed("/dev/outbox", env)).toBe(true);
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

describe("listing photo uploads", () => {
  it("are on everywhere except the public demo", () => {
    expect(allowsPhotoUploads(parseEnv(base))).toBe(true);
    expect(allowsPhotoUploads(parseEnv({ ...base, APP_ENV: "test" }))).toBe(true);
    expect(allowsPhotoUploads({ ...parseEnv(base), APP_ENV: "demo" })).toBe(false);
  });
});
