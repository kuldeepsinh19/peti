import { z } from "zod";
import { PINCODE } from "../domain/contact";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const updateProfileSchema = z.object({
  displayName: trimmed(2, 60, "Display name"),
  bio: optionalText(500),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addressSchema = z.object({
  label: optionalText(40),
  line1: trimmed(3, 120, "Address line 1"),
  line2: optionalText(120),
  landmark: optionalText(80),
  localityId: z.uuid("Choose a locality."),
  pincode: z.string().trim().regex(PINCODE, "Enter a 6-digit PIN code."),
  isDefault: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const addressIdSchema = z.object({ addressId: z.uuid() });

export const payoutAccountSchema = z.object({
  upiVpa: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{2,64}@[a-z][a-z0-9.-]{1,40}$/, "Enter a UPI ID such as name@bank."),
  accountHolderName: trimmed(2, 80, "Account holder name"),
});
export type PayoutAccountInput = z.infer<typeof payoutAccountSchema>;

/** Client-side contracts for auth forms (the server-side checks live in Better Auth). */
export const signUpSchema = z.object({
  name: trimmed(2, 60, "Name"),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
  acceptTerms: z.literal(true, { error: "Please accept the terms to continue." }),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

export const phoneSchema = z.object({
  phone: z.string().trim().min(10, "Enter your 10-digit mobile number."),
});

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});
