import { describe, expect, it } from "vitest";
import { ownerReturnPath } from "@/app/_lib/paths";

describe("owner return path after a listing command", () => {
  const fallback = "/lend/outfits/x/edit";

  it("accepts owner-area paths", () => {
    expect(ownerReturnPath("/lend/dashboard", fallback)).toBe("/lend/dashboard");
    expect(ownerReturnPath("/lend/outfits/0b8c-1/preview", fallback)).toBe("/lend/outfits/0b8c-1/preview");
  });

  it("falls back for anything else", () => {
    for (const value of [
      "https://evil.example/lend/dashboard",
      "//evil.example",
      "/\evil.example",
      "/account",
      "/lend/dashboard?x=1",
      "/lend/../admin",
      "",
      null,
      42,
    ]) {
      expect(ownerReturnPath(value, fallback)).toBe(fallback);
    }
  });
});
