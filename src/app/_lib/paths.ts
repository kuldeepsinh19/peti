/** Only same-site absolute paths: rejects "//host", "/\host" and anything with a scheme. */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && !/[\r\n]/.test(path);
}
