import { describe, expect, it } from "vitest";
import { isSameSitePath } from "@/shared/contracts/safe-path";

describe("isSameSitePath", () => {
  it.each(["/", "/account", "/account/rentals?payment=ok", "/outfits/a-b#photos", "/search?q=%2F%2Fx"])(
    "accepts %s",
    (path) => expect(isSameSitePath(path)).toBe(true),
  );

  it.each([
    ["protocol-relative", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["tab stripped by the URL parser", "/\t/evil.example/login"],
    ["newline stripped by the URL parser", "/\n/evil.example"],
    ["carriage return", "/\r/evil.example"],
    ["leading space", " /account"],
    ["absolute URL", "https://evil.example"],
    ["scheme", "javascript:alert(1)"],
    ["relative path", "account"],
    ["empty", ""],
  ])("rejects a %s path", (_, path) => expect(isSameSitePath(path)).toBe(false));

  it("rejects null and undefined", () => {
    expect(isSameSitePath(null)).toBe(false);
    expect(isSameSitePath(undefined)).toBe(false);
  });
});
