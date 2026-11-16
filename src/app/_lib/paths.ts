import { isSameSitePath } from "@/shared/contracts/safe-path";

/** Only same-site absolute paths: rejects "//host", "/\host", control characters and anything with a scheme. */
export function isSafeReturnPath(path: string): boolean {
  return isSameSitePath(path);
}

/**
 * Where to send an owner after a listing command. The value comes from a form, so only owner-area paths
 * (no query, no fragment) are accepted; anything else falls back.
 */
export function ownerReturnPath(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\/lend\/[A-Za-z0-9/_-]*$/.test(value) && isSafeReturnPath(value)
    ? value
    : fallback;
}
