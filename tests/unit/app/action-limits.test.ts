/**
 * Every Server Action that writes user content is rate limited per user (POC hardening #21). This guard reads
 * the action files, so a new action cannot ship without a limit unless it is listed here with the reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const UNLIMITED: Record<string, string> = {
  requestBooking: "limited inside the use case (BOOKING_REQUEST_LIMIT)",
  startCheckout: "one provider order per booking, reused on retry",
  "admin.": "administrators only",
  "listing.": "administrators only",
  removePhoto: "bounded by the photographs the listing has",
  setCoverPhoto: "reorders existing photographs; stores nothing new",
  command: "listing status changes, bounded by the listing's state",
};

function actionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return actionFiles(p);
    return e.name.endsWith(".ts") && readFileSync(p, "utf8").includes("runAction(") ? [p] : [];
  });
}

/** Each `runAction(...)` call in a file, with its name argument. */
function calls(source: string): Array<{ name: string; text: string }> {
  const found: Array<{ name: string; text: string }> = [];
  for (const m of source.matchAll(/runAction\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && i < source.length) {
      if (source[i] === "(") depth++;
      if (source[i] === ")") depth--;
      i++;
    }
    const text = source.slice(m.index, i);
    const name = /runAction\(\s*["'`]?([\w.]+)/.exec(text)?.[1] ?? "?";
    found.push({ name, text });
  }
  return found;
}

describe("Server Action rate limits", () => {
  const files = actionFiles(path.resolve("src/app")).filter(
    (f) => !f.endsWith(path.join("_lib", "action.ts")),
  );

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("limits every action that is not listed with a reason", () => {
    const missing = files.flatMap((f) =>
      calls(readFileSync(f, "utf8"))
        .filter((c) => !c.text.includes("LIMITS.") && !(c.name in UNLIMITED))
        .map((c) => `${path.relative(process.cwd(), f)}: ${c.name}`),
    );
    expect(missing).toEqual([]);
  });
});
