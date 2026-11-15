/**
 * Phase 1 hardening (docs/audits/PHASE-1-REMEDIATION-REPORT.md): Better Auth's real request handler,
 * built exactly as the app builds it, against the test database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv, type Env } from "@/config/env";
import { DISABLED_PATHS, createAuth } from "@/modules/auth/infrastructure/better-auth";
import { systemClock } from "@/shared/domain/clock";
import { postgresRateLimiter } from "@/shared/infrastructure/rate-limiter";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

const silent = { send: async () => {} };

function authFor(overrides: Record<string, string> = {}) {
  // APP_ENV=local: production-strength limits (the test environment loosens them twentyfold).
  const env: Env = parseEnv({ ...process.env, APP_ENV: "local", ...overrides });
  const auth = createAuth({
    env,
    db,
    mail: silent,
    sms: silent,
    rateLimiter: postgresRateLimiter(db, systemClock),
  });
  const call = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${env.APP_URL}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.APP_URL, ...headers },
        body: JSON.stringify(body),
      }),
    );
  return { env, call };
}

describe("per-account sign-in limit (S-02)", () => {
  it("cannot be escaped by rotating X-Forwarded-For", async () => {
    const { call } = authFor();
    const statuses: number[] = [];
    for (let i = 1; i <= 21; i++) {
      const res = await call(
        "/sign-in/email",
        { email: "Victim@Example.in", password: `guess-number-${i}` },
        { "x-forwarded-for": `198.51.100.${i}` },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);

    // Another account is unaffected.
    const other = await call(
      "/sign-in/email",
      { email: "someone.else@example.in", password: "guess-number-1" },
      { "x-forwarded-for": "198.51.100.99" },
    );
    expect(other.status).toBe(401);
  });

  it("sending a one-time code requires a signed-in user", async () => {
    const { call } = authFor();
    const res = await call("/phone-number/send-otp", { phoneNumber: "+919000000006" });
    expect(res.status).toBe(403);
    expect(await db.devOutboxMessage.count()).toBe(0);
  });
});

describe("endpoints the product does not use (S-05, H2)", () => {
  it("answer 404 whatever the method, so they cannot be reached directly", async () => {
    const { env } = authFor();
    const auth = createAuth({
      env,
      db,
      mail: silent,
      sms: silent,
      rateLimiter: postgresRateLimiter(db, systemClock),
    });
    // Pinned here, independently of DISABLED_PATHS, so removing one from the config fails this test.
    const mustStayOff = [
      "/admin/impersonate-user",
      "/admin/set-role",
      "/admin/set-user-password",
      "/admin/list-users",
      "/admin/remove-user",
      "/admin/update-user",
      "/sign-in/phone-number",
      "/phone-number/request-password-reset",
      "/phone-number/reset-password",
      "/change-email",
      "/change-password",
      "/update-user",
    ];
    for (const path of new Set([...mustStayOff, ...DISABLED_PATHS])) {
      for (const method of ["GET", "POST"]) {
        const res = await auth.handler(
          new Request(`${env.APP_URL}/api/auth${path}`, {
            method,
            headers: { "content-type": "application/json", origin: env.APP_URL },
            ...(method === "POST" ? { body: "{}" } : {}),
          }),
        );
        expect({ path, method, status: res.status }).toEqual({ path, method, status: 404 });
      }
    }
  });
});
