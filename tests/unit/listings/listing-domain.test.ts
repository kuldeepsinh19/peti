import { describe, expect, it } from "vitest";
import { cmToMm, listingSlug, validateListingMoney } from "@/modules/listings/domain/listing-rules";
import { OUTFIT_STATUSES, editNeedsReview, nextOutfitStatus } from "@/modules/listings/domain/outfit-status";

describe("outfit status machine", () => {
  it("only lets owners submit drafts and only admins approve", () => {
    expect(nextOutfitStatus("DRAFT", "submit", "owner")).toBe("PENDING_REVIEW");
    expect(nextOutfitStatus("PENDING_REVIEW", "approve", "admin")).toBe("ACTIVE");
    expect(() => nextOutfitStatus("PENDING_REVIEW", "approve", "owner")).toThrow();
    expect(() => nextOutfitStatus("DRAFT", "approve", "admin")).toThrow();
  });

  it("never lets anything leave ARCHIVED, and only reinstatement leaves SUSPENDED", () => {
    const commands = [
      "submit",
      "withdraw",
      "approve",
      "reject",
      "pause",
      "resume",
      "contentEdited",
      "archive",
      "suspend",
      "reinstate",
    ] as const;
    const roles = ["owner", "admin", "system"] as const;
    for (const command of commands) {
      for (const role of roles) {
        expect(() => nextOutfitStatus("ARCHIVED", command, role)).toThrow();
        if (!(command === "reinstate" && role === "admin"))
          expect(() => nextOutfitStatus("SUSPENDED", command, role)).toThrow();
      }
    }
    expect(nextOutfitStatus("SUSPENDED", "reinstate", "admin")).toBe("PAUSED");
  });

  it("sends only live content edits back to review", () => {
    expect(editNeedsReview("ACTIVE", true)).toBe(true);
    expect(editNeedsReview("PAUSED", true)).toBe(true);
    expect(editNeedsReview("ACTIVE", false)).toBe(false);
    for (const s of OUTFIT_STATUSES.filter((x) => x !== "ACTIVE" && x !== "PAUSED"))
      expect(editNeedsReview(s, true)).toBe(false);
  });
});

describe("listing money rules", () => {
  const base = {
    retailValuePaise: 3_000_000,
    depositPaise: 600_000,
    prices: [{ durationDays: 3, pricePaise: 350_000 }],
  };

  it("accepts a sensible listing", () => {
    expect(validateListingMoney(base)).toEqual({});
  });

  it("bounds the deposit between the minimum and the retail value", () => {
    expect(validateListingMoney({ ...base, depositPaise: 10_000 })).toHaveProperty("depositRupees");
    expect(validateListingMoney({ ...base, depositPaise: 3_000_001 })).toHaveProperty("depositRupees");
  });

  it("requires a price, offered durations only, and longer rentals not cheaper than shorter ones", () => {
    expect(validateListingMoney({ ...base, prices: [] })).toHaveProperty("prices");
    expect(
      validateListingMoney({ ...base, prices: [{ durationDays: 4, pricePaise: 350_000 }] }),
    ).toHaveProperty("price4");
    expect(
      validateListingMoney({
        ...base,
        prices: [
          { durationDays: 3, pricePaise: 350_000 },
          { durationDays: 5, pricePaise: 300_000 },
        ],
      }),
    ).toHaveProperty("price5");
  });
});

describe("helpers", () => {
  it("converts centimetres to whole millimetres", () => {
    expect(cmToMm(102.5)).toBe(1025);
    expect(cmToMm(undefined)).toBeNull();
  });

  it("builds URL-safe slugs with a random suffix", () => {
    const slug = listingSlug("Ivory Sherwani — Worn Once!", () => 0);
    expect(slug).toBe("ivory-sherwani-worn-once-aaaaa");
  });
});
