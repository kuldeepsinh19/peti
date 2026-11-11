import { marketplacePolicy } from "@/config/marketplace-policy";

/**
 * Cross-field listing rules shared by the form contract and the use cases. Returns field errors keyed by
 * form field; an empty object means the listing is valid.
 */
export interface ListingMoney {
  retailValuePaise: number;
  depositPaise: number;
  prices: ReadonlyArray<{ durationDays: number; pricePaise: number }>;
}

export function validateListingMoney(input: ListingMoney): Record<string, string> {
  const errors: Record<string, string> = {};
  const policy = marketplacePolicy;

  if (input.depositPaise < policy.depositMinPaise) {
    errors.depositRupees = `The deposit must be at least ₹${policy.depositMinPaise / 100}.`;
  } else if (input.depositPaise > input.retailValuePaise) {
    errors.depositRupees = "The deposit cannot be more than the outfit's retail value.";
  }

  if (input.prices.length === 0) {
    errors.prices = "Set a price for at least one rental duration.";
  }
  const allowed: readonly number[] = policy.durationOptionsDays;
  for (const p of input.prices) {
    const field = `price${p.durationDays}`;
    if (!allowed.includes(p.durationDays)) errors[field] = "That duration is not offered.";
    else if (p.pricePaise < policy.rentalFeeMinPaise)
      errors[field] = `At least ₹${policy.rentalFeeMinPaise / 100}.`;
    else if (p.pricePaise > input.retailValuePaise) errors[field] = "Cannot exceed the retail value.";
  }

  // Longer rentals should never cost less than shorter ones.
  const sorted = [...input.prices].sort((a, b) => a.durationDays - b.durationDays);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.pricePaise < prev.pricePaise) {
      errors[`price${cur.durationDays}`] = `Should not be less than the ${prev.durationDays}-day price.`;
    }
  }
  return errors;
}

/** Whole-cm or one-decimal cm input → integer millimetres. */
export function cmToMm(cm: number | undefined | null): number | null {
  if (cm === undefined || cm === null || Number.isNaN(cm)) return null;
  return Math.round(cm * 10);
}

export function mmToCm(mm: number | null): number | null {
  return mm === null ? null : mm / 10;
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function listingSlug(title: string, random: () => number = Math.random): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const suffix = Array.from(
    { length: 5 },
    () => SLUG_ALPHABET[Math.floor(random() * SLUG_ALPHABET.length)],
  ).join("");
  return `${base || "outfit"}-${suffix}`;
}
