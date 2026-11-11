/**
 * Money is always an integer number of paise (1 rupee = 100 paise). Never use floating-point rupees
 * for arithmetic. Values stay well inside Number.MAX_SAFE_INTEGER and the database `integer` range.
 */
declare const paiseBrand: unique symbol;
export type Paise = number & { readonly [paiseBrand]: "Paise" };

export const MAX_PAISE = 2_000_000_000; // ₹2 crore — comfortably below the int4 maximum

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new InvalidMoneyError(`Paise must be an integer, got ${value}`);
  if (value < 0) throw new InvalidMoneyError(`Paise must not be negative, got ${value}`);
  if (value > MAX_PAISE) throw new InvalidMoneyError(`Amount exceeds the supported maximum: ${value}`);
  return value as Paise;
}

export const ZERO_PAISE = paise(0);

export function rupees(wholeRupees: number): Paise {
  if (!Number.isSafeInteger(wholeRupees)) {
    throw new InvalidMoneyError(`Rupee amounts must be whole numbers, got ${wholeRupees}`);
  }
  return paise(wholeRupees * 100);
}

export function addPaise(...values: Paise[]): Paise {
  return paise(values.reduce<number>((sum, v) => sum + v, 0));
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  if (b > a) throw new InvalidMoneyError(`Cannot subtract ${b} from ${a}: result would be negative`);
  return paise(a - b);
}

export function minPaise(a: Paise, b: Paise): Paise {
  return (a < b ? a : b) as Paise;
}

/** Basis points: 10000 bps = 100%. */
export type BasisPoints = number & { readonly __bps: true };

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new InvalidMoneyError(`Basis points must be an integer between 0 and 10000, got ${value}`);
  }
  return value as BasisPoints;
}

/**
 * amount × bps / 10000, rounded half up, using integer arithmetic only.
 * (a * b + 5000) / 10000 with floor division is exact for non-negative integers.
 */
export function applyBasisPoints(amount: Paise, bps: BasisPoints): Paise {
  return paise(Math.floor((amount * bps + 5_000) / 10_000));
}

/** Multiply by a rational factor numerator/denominator, rounding up (used for per-day late fees). */
export function mulDivCeil(amount: Paise, numerator: number, denominator: number): Paise {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator <= 0) {
    throw new InvalidMoneyError(
      "mulDivCeil expects a non-negative integer numerator and positive denominator",
    );
  }
  return paise(Math.ceil((amount * numerator) / denominator));
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹12,500 — paise are shown only when the amount is not a whole number of rupees. */
export function formatInr(amount: number): string {
  return amount % 100 === 0 ? inrWhole.format(amount / 100) : inrExact.format(amount / 100);
}
