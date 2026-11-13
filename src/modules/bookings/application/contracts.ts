import { z } from "zod";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { isLocalDate } from "@/shared/domain/local-date";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const accepted = z.preprocess(
  (v) => v === true || v === "on" || v === "true",
  z.literal(true, { error: "Please accept the rental terms." }),
);

export const requestBookingSchema = z.object({
  outfitId: z.uuid(),
  startDate: z.string().refine(isLocalDate, "Choose a valid start date."),
  days: z.coerce
    .number()
    .int()
    .refine(
      (d) => (marketplacePolicy.durationOptionsDays as readonly number[]).includes(d),
      "Choose a rental length.",
    ),
  note: optionalText(500),
  acceptTerms: accepted,
});
export type RequestBookingInput = z.input<typeof requestBookingSchema>;

export const bookingIdSchema = z.object({ bookingId: z.uuid() });

export const bookingReasonSchema = z.object({ bookingId: z.uuid(), reason: optionalText(500) });

export const adminCancelSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(5, "Give a reason for the record.").max(500),
  retainedFeeRupees: z.coerce.number().int().min(0),
});

export const GRADES = ["NEW_WITH_TAGS", "EXCELLENT", "GOOD", "FAIR"] as const;

export const conditionReportSchema = z.object({
  bookingId: z.uuid(),
  grade: z.enum(GRADES, { error: "Choose the condition." }),
  notes: z.string().trim().min(5, "Describe the condition.").max(2000),
  returnedOn: z
    .string()
    .refine(isLocalDate, "Choose a valid date.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const acknowledgeSchema = z.object({ bookingId: z.uuid(), notes: optionalText(1000) });

export const DISPUTE_KINDS = [
  "DAMAGE",
  "MISSING_ITEMS",
  "NOT_RETURNED",
  "LATE_FEE_CONTESTED",
  "HANDOVER_FAILED",
  "NOT_AS_DESCRIBED",
  "RETURN_NOT_ACKNOWLEDGED",
  "OTHER",
] as const;

export const openDisputeSchema = z.object({
  bookingId: z.uuid(),
  kind: z.enum(DISPUTE_KINDS, { error: "Choose what went wrong." }),
  description: z.string().trim().min(20, "Describe what happened in at least 20 characters.").max(3000),
  claimedRupees: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    // Upper bound keeps the paise value inside a 32-bit integer column (₹1 crore is far above any deposit).
    z.coerce.number().int().min(1).max(10_000_000).optional(),
  ),
});

export const resolveDisputeSchema = z.object({
  bookingId: z.uuid(),
  outcome: z.enum(["COMPLETE", "CANCEL"]),
  depositWithheldRupees: z.coerce.number().int().min(0),
  retainedFeeRupees: z.coerce.number().int().min(0),
  notes: z.string().trim().min(10, "Explain the decision for the record.").max(3000),
});

export const disputeMessageSchema = z.object({
  bookingId: z.uuid(),
  body: z.string().trim().min(2).max(2000),
});
