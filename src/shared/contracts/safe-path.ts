const PROBE_ORIGIN = "http://same-site.invalid";

/**
 * True only for a same-site absolute path such as "/account/rentals?x=1".
 *
 * Browsers strip tabs and newlines and treat "\" like "/" when they parse a URL, so prefix checks alone are
 * not enough: "/\t/evil.example" becomes "//evil.example". Any control character, space or backslash is
 * refused, and the path must resolve to the same origin.
 */
export function isSameSitePath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  if (/[\u0000- \u007f\\]/.test(path)) return false;
  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}
