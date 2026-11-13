import { isSameSitePath } from "@/shared/contracts/safe-path";

/** Only same-site absolute paths: rejects "//host", "/\host", control characters and anything with a scheme. */
export function isSafeReturnPath(path: string): boolean {
  return isSameSitePath(path);
}
