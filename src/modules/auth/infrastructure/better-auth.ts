import "server-only";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, phoneNumber } from "better-auth/plugins";
import type { Env } from "@/config/env";
import type { Db } from "@/shared/infrastructure/prisma";
import {
  type MailSender,
  type SmsSender,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/modules/notifications";
import { INDIAN_MOBILE } from "@/modules/users";

interface AuthDeps {
  env: Env;
  db: Db;
  mail: MailSender;
  sms: SmsSender;
}

/**
 * Better Auth configuration (ADR-001): email + password, database sessions, email verification, password
 * reset, phone OTP verification, admin roles/bans and database-backed rate limiting.
 */
export function createAuth({ env, db, mail, sms }: AuthDeps) {
  const trustedOrigins = [
    env.APP_URL,
    ...(env.AUTH_TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? []),
  ];

  return betterAuth({
    appName: "Peti",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: prismaAdapter(db, { provider: "postgresql" }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.APP_URL.startsWith("https://"),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await mail.send(resetPasswordMessage(user.email, user.name, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await mail.send(verifyEmailMessage(user.email, user.name, url));
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 5 },
        "/phone-number/send-otp": { window: 300, max: 5 },
        "/phone-number/verify": { window: 300, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every account gets an app-owned profile row.
          after: async (user) => {
            await db.userProfile.upsert({
              where: { userId: user.id },
              create: { userId: user.id, displayName: user.name.slice(0, 60) },
              update: {},
            });
          },
        },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        phoneNumberValidator: (value) => INDIAN_MOBILE.test(value),
        sendOTP: async ({ phoneNumber: to, code }) => {
          await sms.send(to, `${code} is your Peti verification code. It expires in 5 minutes.`);
        },
      }),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      // Must be last: lets Server Actions set auth cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
