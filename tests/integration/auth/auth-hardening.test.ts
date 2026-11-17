/**
 * Phase 1 hardening (docs/audits/PHASE-1-REMEDIATION-REPORT.md): Better Auth's real request handler,
 * built exactly as the app builds it, against the test database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv, type Env } from "@/config/env";
import { legalDocuments } from "@/config/site";
import { DEMO_DISABLED_PATHS, DISABLED_PATHS, createAuth } from "@/modules/auth/infrastructure/better-auth";
import { systemClock } from "@/shared/domain/clock";
import { postgresRateLimiter } from "@/shared/infrastructure/rate-limiter";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

const silent = { send: async () => {}, sendOtp: async () => {} };

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

describe("public demo: no self-service account management", () => {
  const demoEnv = {
    APP_ENV: "demo",
    SANDBOX_PAYMENT_KEY_SECRET: "a-real-random-sandbox-key",
    SANDBOX_PAYMENT_WEBHOOK_SECRET: "a-real-random-sandbox-webhook",
    CRON_SECRET: "a-real-random-cron-secret",
    AUTH_IP_HEADERS: "x-real-ip",
    BETTER_AUTH_SECRET: "a-demo-secret-that-is-long-enough-123456",
  };

  it("refuses sign-up, password reset and phone verification, so shared accounts cannot be taken over", async () => {
    const { call } = authFor(demoEnv);
    expect(
      (
        await call("/sign-up/email", {
          name: "Real Person",
          email: "real@example.in",
          password: "a-long-password-1",
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("/request-password-reset", { email: "rohan@peti.local", redirectTo: "/reset-password" }))
        .status,
    ).toBe(404);
    expect((await call("/reset-password", { newPassword: "taken-over-123", token: "x" })).status).toBe(404);
    expect((await call("/phone-number/send-otp", { phoneNumber: "+919000000006" })).status).toBe(404);
    for (const path of DEMO_DISABLED_PATHS) {
      expect({ path, status: (await call(path, {})).status }).toEqual({ path, status: 404 });
    }
    expect(await db.user.count()).toBe(0);
    expect(await db.devOutboxMessage.count()).toBe(0);
  });

  it("still lets the shared demo accounts sign in", async () => {
    const { call: signUpLocally } = authFor();
    await signUpLocally("/sign-up/email", {
      name: "Rohan",
      email: "rohan@peti.local",
      password: "peti-demo-password",
      acceptTerms: true,
    });
    const { call } = authFor(demoEnv);
    const res = await call(
      "/sign-in/email",
      { email: "rohan@peti.local", password: "peti-demo-password" },
      { "x-real-ip": "203.0.113.5" },
    );
    expect(res.status).toBe(200);
  });
});

describe("sign-up cannot attach a mobile number", () => {
  // Better Auth's phone plugin refuses it (PHONE_NUMBER_CANNOT_BE_SET); this pins that behaviour, since a
  // number set at sign-up would let anyone claim, and so block, a stranger's (unique) number.
  it("refuses a phone number in the sign-up body, so nobody can claim a stranger's number", async () => {
    const { call } = authFor();
    const res = await call("/sign-up/email", {
      name: "Squatter",
      email: "squatter@example.in",
      password: "a-long-enough-password",
      acceptTerms: true,
      phoneNumber: "+919876543210",
    });
    expect(res.status).toBe(400);
    expect(await db.user.count({ where: { email: "squatter@example.in" } })).toBe(0);
    expect(await db.user.count({ where: { phoneNumber: "+919876543210" } })).toBe(0);

    const verifiedFlag = await call("/sign-up/email", {
      name: "Squatter",
      email: "squatter2@example.in",
      password: "a-long-enough-password",
      acceptTerms: true,
      phoneNumberVerified: true,
    });
    expect(verifiedFlag.status).toBe(400);
  });
});

describe("sign-up consent and name (#7, #17)", () => {
  const signUp = (call: ReturnType<typeof authFor>["call"], body: Record<string, unknown>) =>
    call("/sign-up/email", { password: "a-long-enough-password", ...body });

  it("creates nothing without accepted terms or with a name the profile cannot hold", async () => {
    const { call } = authFor();
    for (const body of [
      { name: "Asha Mehta", email: "no-terms@example.in" },
      { name: "Asha Mehta", email: "false-terms@example.in", acceptTerms: false },
      { name: "x", email: "short@example.in", acceptTerms: true },
      { name: "   ", email: "blank@example.in", acceptTerms: true },
      { name: "a".repeat(61), email: "long@example.in", acceptTerms: true },
    ]) {
      expect((await signUp(call, body)).status).toBe(400);
    }
    expect(await db.user.count()).toBe(0);
  });

  it("records when the terms were accepted, and which version, with the profile", async () => {
    const { call } = authFor();
    const res = await signUp(call, { name: "  Asha Mehta ", email: "asha@example.in", acceptTerms: true });
    expect(res.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({
      where: { email: "asha@example.in" },
      include: { profile: true },
    });
    expect(user.termsVersion).toBe(legalDocuments.version);
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    expect(user.profile?.displayName).toBe("Asha Mehta");
  });

  it("cannot be given an acceptance date by the request", async () => {
    const { call } = authFor();
    await signUp(call, {
      name: "Asha Mehta",
      email: "forged@example.in",
      acceptTerms: true,
      termsAcceptedAt: "2001-01-01T00:00:00Z",
      termsVersion: "forged",
    });
    const user = await db.user.findUnique({ where: { email: "forged@example.in" } });
    // Either refused outright, or stamped by the server — never the values sent.
    if (user) {
      expect(user.termsVersion).toBe(legalDocuments.version);
      expect(user.termsAcceptedAt!.getFullYear()).not.toBe(2001);
    }
  });
});
