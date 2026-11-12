import { z } from "zod";

/**
 * Environment configuration, validated once and cached.
 *
 * `APP_ENV` is explicit on purpose: `NODE_ENV` is "production" for every `next start`, including
 * previews and the e2e server, so it cannot decide whether the sandbox payment provider or the dev
 * outbox may run.
 */
const appEnv = z.enum(["local", "test", "staging", "production"]);

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

export const envSchema = z
  .object({
    APP_ENV: appEnv.default("local"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /** Comma-separated list of extra trusted origins for auth (e.g. the e2e server). */
    AUTH_TRUSTED_ORIGINS: optionalString,
    /** Comma-separated headers that carry the client IP (set by your proxy, never by clients). */
    AUTH_IP_HEADERS: optionalString,
    /** Comma-separated proxy addresses allowed to append to X-Forwarded-For. */
    AUTH_TRUSTED_PROXIES: optionalString,

    PAYMENT_PROVIDER: z.enum(["sandbox", "razorpay"]).default("sandbox"),
    SANDBOX_PAYMENT_KEY_SECRET: optionalString,
    SANDBOX_PAYMENT_WEBHOOK_SECRET: optionalString,
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,

    STORAGE_DRIVER: z.enum(["filesystem", "s3"]).default("filesystem"),
    STORAGE_FS_ROOT: z.string().default("./storage"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("ap-south-1"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: booleanString,

    MAIL_DRIVER: z.enum(["outbox", "smtp"]).default("outbox"),
    MAIL_FROM: z.string().default("Peti <no-reply@peti.local>"),
    SMTP_URL: optionalString,
    SMS_DRIVER: z.enum(["outbox"]).default("outbox"),

    CRON_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (env.PAYMENT_PROVIDER === "sandbox") {
      if (!env.SANDBOX_PAYMENT_KEY_SECRET)
        issue("SANDBOX_PAYMENT_KEY_SECRET", "required for the sandbox provider");
      if (!env.SANDBOX_PAYMENT_WEBHOOK_SECRET)
        issue("SANDBOX_PAYMENT_WEBHOOK_SECRET", "required for the sandbox provider");
    }
    if (env.PAYMENT_PROVIDER === "razorpay") {
      for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!env[key]) issue(key, "required when PAYMENT_PROVIDER=razorpay");
      }
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[key]) issue(key, "required when STORAGE_DRIVER=s3");
      }
    }
    if (env.MAIL_DRIVER === "smtp" && !env.SMTP_URL) issue("SMTP_URL", "required when MAIL_DRIVER=smtp");

    // Production must never run the sandbox provider, the dev outbox or local-disk storage.
    if (env.APP_ENV === "production") {
      if (env.PAYMENT_PROVIDER !== "razorpay")
        issue("PAYMENT_PROVIDER", "production requires a real payment provider");
      if (env.SANDBOX_PAYMENT_KEY_SECRET || env.SANDBOX_PAYMENT_WEBHOOK_SECRET)
        issue("SANDBOX_PAYMENT_KEY_SECRET", "sandbox payment secrets must not be set in production");
      if (env.MAIL_DRIVER === "outbox") issue("MAIL_DRIVER", "production requires real email delivery");
      if (env.SMS_DRIVER === "outbox") {
        issue(
          "SMS_DRIVER",
          "production requires a real SMS provider (none is implemented yet; see the deployment guide)",
        );
      }
      if (env.STORAGE_DRIVER !== "s3") issue("STORAGE_DRIVER", "production requires object storage");
      if (!env.CRON_SECRET) issue("CRON_SECRET", "required in production");
      if (env.RAZORPAY_KEY_ID?.startsWith("rzp_live_"))
        issue("RAZORPAY_KEY_ID", "live Razorpay keys are not supported by this MVP; use test-mode keys");
    }
    // Placeholder values from .env.example must never reach a shared environment.
    if (env.APP_ENV !== "local" && env.APP_ENV !== "test") {
      for (const key of [
        "BETTER_AUTH_SECRET",
        "CRON_SECRET",
        "SANDBOX_PAYMENT_KEY_SECRET",
        "SANDBOX_PAYMENT_WEBHOOK_SECRET",
      ] as const) {
        if (env[key]?.startsWith("replace-with"))
          issue(key, "still has the placeholder value from .env.example");
      }
    }
    if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
      issue("RAZORPAY_KEY_ID", "only Razorpay test-mode keys (rzp_test_…) are accepted");
    }
  });

export type Env = z.infer<typeof envSchema>;
export type AppEnv = z.infer<typeof appEnv>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "InvalidEnvironmentError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Fail closed: a server started with NODE_ENV=production but no APP_ENV is treated as production, so a
  // forgotten variable can never switch on the sandbox payment provider or the dev outbox.
  const appEnv = source.APP_ENV ?? (source.NODE_ENV === "production" ? "production" : "local");
  const result = envSchema.safeParse({ ...source, APP_ENV: appEnv });
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazily parsed so that `next build` and tooling can import modules without a full environment. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Development conveniences (dev outbox, sandbox checkout, design-system page) are only routable here. */
export function isDevToolingEnabled(env: Env = getEnv()): boolean {
  return env.APP_ENV === "local" || env.APP_ENV === "test";
}
