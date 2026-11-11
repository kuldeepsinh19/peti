import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidMoneyError,
  addPaise,
  applyBasisPoints,
  basisPoints,
  formatInr,
  mulDivCeil,
  paise,
  rupees,
  subtractPaise,
} from "@/shared/domain/money";

describe("paise", () => {
  it("rejects fractions, negatives and amounts above the supported maximum", () => {
    expect(() => paise(1.5)).toThrow(InvalidMoneyError);
    expect(() => paise(-1)).toThrow(InvalidMoneyError);
    expect(() => paise(2_000_000_001)).toThrow(InvalidMoneyError);
    expect(paise(0)).toBe(0);
  });

  it("converts whole rupees exactly", () => {
    expect(rupees(12_500)).toBe(1_250_000);
    expect(() => rupees(10.5)).toThrow(InvalidMoneyError);
  });

  it("never produces a negative result when subtracting", () => {
    expect(subtractPaise(paise(500), paise(200))).toBe(300);
    expect(() => subtractPaise(paise(200), paise(500))).toThrow(InvalidMoneyError);
    expect(addPaise(paise(1), paise(2), paise(3))).toBe(6);
  });
});

describe("applyBasisPoints", () => {
  it("rounds half up at the boundary", () => {
    // 15% of ₹0.03 = 0.45 paise → 0; 15% of ₹0.10 = 1.5 paise → 2
    expect(applyBasisPoints(paise(3), basisPoints(1500))).toBe(0);
    expect(applyBasisPoints(paise(10), basisPoints(1500))).toBe(2);
    expect(applyBasisPoints(rupees(4_500), basisPoints(1500))).toBe(67_500);
  });

  it("matches exact rational rounding for any amount and rate", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (amount, bps) => {
          const result = applyBasisPoints(paise(amount), basisPoints(bps));
          const exact = (BigInt(amount) * BigInt(bps) * 2n + 10_000n) / 20_000n; // half-up in bigint
          expect(BigInt(result)).toBe(exact);
          expect(result).toBeLessThanOrEqual(amount);
        },
      ),
    );
  });
});

describe("mulDivCeil", () => {
  it("rounds up to the next paisa", () => {
    // ₹4,500 over 3 days × 3/2 = ₹2,250 per day exactly
    expect(mulDivCeil(rupees(4_500), 3, 2 * 3)).toBe(225_000);
    expect(mulDivCeil(paise(100), 1, 3)).toBe(34);
  });
});

describe("formatInr", () => {
  it("uses Indian digit grouping and hides zero paise", () => {
    expect(formatInr(rupees(125_000))).toBe("₹1,25,000");
    expect(formatInr(paise(150))).toBe("₹1.50");
  });
});
