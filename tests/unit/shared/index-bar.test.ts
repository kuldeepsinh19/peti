import { describe, expect, it } from "vitest";
import { isActive } from "@/shared/ui/index-bar";

describe("account bar tab matching", () => {
  const profile = {
    href: "/account",
    label: "Profile & settings",
    exact: true,
    also: ["/account/addresses", "/account/notifications"],
  };
  const outfits = { href: "/lend/dashboard", label: "My outfits", also: ["/lend/outfits"] };

  it("matches an exact tab only on its own page or the routes it owns", () => {
    expect(isActive("/account", profile)).toBe(true);
    expect(isActive("/account/notifications", profile)).toBe(true);
    expect(isActive("/account/rentals", profile)).toBe(false);
    expect(isActive("/account/addressesX", profile)).toBe(false);
  });

  it("matches a section spread over several route groups", () => {
    expect(isActive("/lend/dashboard", outfits)).toBe(true);
    expect(isActive("/lend/outfits/new", outfits)).toBe(true);
    expect(isActive("/lend/outfits/123/photos", outfits)).toBe(true);
    expect(isActive("/lend/requests", outfits)).toBe(false);
  });
});
