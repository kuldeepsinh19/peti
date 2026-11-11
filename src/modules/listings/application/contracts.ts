import { z } from "zod";
import { marketplacePolicy } from "@/config/marketplace-policy";

export const SIZE_LABELS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "FREE_SIZE"] as const;
export const CONDITION_GRADES = ["NEW_WITH_TAGS", "EXCELLENT", "GOOD", "FAIR"] as const;
export const OCCASIONS = [
  "MEHENDI",
  "HALDI",
  "SANGEET",
  "WEDDING",
  "RECEPTION",
  "ENGAGEMENT",
  "NAVRATRI",
] as const;
export const MEASUREMENT_FIELDS = [
  "chest",
  "waist",
  "hip",
  "shoulder",
  "sleeve",
  "length",
  "bottomWaist",
  "bottomLength",
] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

const rupees = (label: string, max = 20_00_000) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `Enter ${label} in whole rupees.` })
      .int(`Enter ${label} in whole rupees.`)
      .min(1, `Enter ${label}.`)
      .max(max, `That ${label} is too high.`),
  );

const optionalRupees = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int("Whole rupees only.").min(1).max(20_00_000).optional(),
);

const optionalCm = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: "Enter centimetres." })
      .min(10, "At least 10 cm.")
      .max(max, `At most ${max} cm.`)
      .optional(),
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const asArray = (v: unknown) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]);

/** One contract for the listing form, used by the browser form and re-parsed by the server action. */
export const listingFormSchema = z.object({
  title: z.string().trim().min(5, "At least 5 characters.").max(120, "At most 120 characters."),
  description: z.string().trim().min(30, "Describe the outfit in at least 30 characters.").max(3000),
  categoryId: z.uuid("Choose a category."),
  brand: optionalText(80),
  colour: optionalText(60),
  fabric: optionalText(80),
  sizeLabel: z.enum(SIZE_LABELS, { error: "Choose a size." }),
  conditionGrade: z.enum(CONDITION_GRADES, { error: "Choose a condition." }),
  conditionNotes: z.string().trim().min(5, "Describe the condition, including any flaws.").max(1000),
  retailValueRupees: rupees("the retail value"),
  depositRupees: rupees("a deposit"),
  turnaroundDays: z.coerce.number().int().min(0).max(marketplacePolicy.turnaroundDaysMax),
  occasions: z.preprocess(asArray, z.array(z.enum(OCCASIONS)).min(1, "Choose at least one occasion.")),
  localityId: z.uuid("Choose a locality."),
  pickupAddressId: z.uuid("Choose the pickup address."),
  price2: optionalRupees,
  price3: optionalRupees,
  price5: optionalRupees,
  price7: optionalRupees,
  chest: optionalCm(300),
  waist: optionalCm(300),
  hip: optionalCm(300),
  shoulder: optionalCm(300),
  sleeve: optionalCm(300),
  length: optionalCm(1000),
  bottomWaist: optionalCm(300),
  bottomLength: optionalCm(300),
  measurementNotes: optionalText(300),
});
export type ListingFormInput = z.input<typeof listingFormSchema>;
export type ListingFormData = z.output<typeof listingFormSchema>;

export const outfitIdSchema = z.object({ outfitId: z.uuid() });

export const moderationSchema = z.object({
  outfitId: z.uuid(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const photoIdSchema = z.object({ outfitId: z.uuid(), photoId: z.uuid() });
