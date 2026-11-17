import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * After a form action fails, its message travels to the page in the redirect URL. The message is signed, so a
 * crafted link cannot make a Peti page display text that Peti did not write (POC hardening #23).
 */
function sign(key: string, message: string, secret: string): string {
  return createHmac("sha256", secret).update(`flash:${key}:${message}`).digest("base64url").slice(0, 22);
}

/** The query string (without `?`) that carries `message` under `key`, with its signature. */
export function errorQuery(message: string, key = "error", secret = getEnv().BETTER_AUTH_SECRET): string {
  return new URLSearchParams({ [key]: message, [`${key}Sig`]: sign(key, message, secret) }).toString();
}

/** The message under `key` when its signature is valid; otherwise nothing is shown. */
export function signedError(
  params: { readonly [name: string]: unknown },
  key = "error",
  secret = getEnv().BETTER_AUTH_SECRET,
): string | undefined {
  const message = params[key];
  const given = params[`${key}Sig`];
  if (typeof message !== "string" || typeof given !== "string") return undefined;
  const expected = Buffer.from(sign(key, message, secret));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? message : undefined;
}
