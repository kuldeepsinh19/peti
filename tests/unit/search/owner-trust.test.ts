import { describe, expect, it } from "vitest";
import { ownerTrustLine } from "@/modules/search/ui/outfit-grid";

describe("lender line on an outfit card", () => {
  it("says a lender is new until they have completed a rental or been reviewed", () => {
    expect(ownerTrustLine({ ownerRating: null, ownerRatingCount: 0, ownerCompletedRentals: 0 })).toBe(
      "New lender",
    );
    expect(ownerTrustLine({ ownerRating: null, ownerRatingCount: 0, ownerCompletedRentals: 1 })).toBe(
      "1 rental completed",
    );
  });

  it("shows the rating with one decimal once there are reviews", () => {
    expect(ownerTrustLine({ ownerRating: 4.7, ownerRatingCount: 3, ownerCompletedRentals: 12 })).toBe(
      "★ 4.7 · 12 rentals",
    );
    expect(ownerTrustLine({ ownerRating: 5, ownerRatingCount: 1, ownerCompletedRentals: 1 })).toBe(
      "★ 5.0 · 1 rental",
    );
  });
});
