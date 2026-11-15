import { describe, expect, it } from "vitest";
import { bearerMatches } from "@/app/_lib/bearer";

describe("bearer secret check (scheduler and monitoring endpoints)", () => {
  const secret = "s3cret-value-of-reasonable-length";

  it("accepts only the exact secret", () => {
    expect(bearerMatches("Bearer " + secret, secret)).toBe(true);
    expect(bearerMatches("Bearer " + secret + "x", secret)).toBe(false);
    expect(bearerMatches("Bearer " + secret.slice(0, -1), secret)).toBe(false);
    expect(bearerMatches("Bearer " + secret.toUpperCase(), secret)).toBe(false);
  });

  it("is closed when the header is missing, malformed, or no secret is configured", () => {
    expect(bearerMatches(null, secret)).toBe(false);
    expect(bearerMatches(secret, secret)).toBe(false);
    expect(bearerMatches("Basic " + secret, secret)).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer anything", undefined)).toBe(false);
  });
});
