import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer …` header against a configured secret. False when no
 * secret is configured, so an endpoint guarded by this is closed by default.
 */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
