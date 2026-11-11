/** Indian mobile numbers in E.164 form, as stored (+91 followed by 10 digits starting 6–9). */
export const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

/** Accepts "98765 43210", "+91 98765-43210", "09876543210" and returns "+919876543210", or null. */
export function normaliseIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  const local = digits.replace(/^(\+91|0091|91|0)(?=[6-9]\d{9}$)/, "");
  const candidate = `+91${local}`;
  return INDIAN_MOBILE.test(candidate) ? candidate : null;
}

/** "+91 98765 43210" for display. */
export function formatIndianMobile(e164: string): string {
  return INDIAN_MOBILE.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164;
}

export const PINCODE = /^[1-9]\d{5}$/;
