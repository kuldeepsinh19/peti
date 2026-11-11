import { z } from "zod";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { isLocalDate } from "@/shared/domain/local-date";

const OCCASIONS = ["MEHENDI", "HALDI", "SANGEET", "WEDDING", "RECEPTION", "ENGAGEMENT", "NAVRATRI"] as const;
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "FREE_SIZE"] as const;
export const SORTS = ["newest", "price-asc", "price-desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

/** Search parameters arrive as untrusted strings; anything malformed is dropped rather than erroring. */
const loose = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v === "" ? undefined : v),
    schema.optional().catch(undefined),
  );

const looseList = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")),
    z
      .array(z.unknown())
      .transform((items) => items.filter((i): i is z.infer<T> => schema.safeParse(i).success)),
  );

const rupeeBound = loose(z.coerce.number().int().min(0).max(10_00_000));
const cmBound = loose(z.coerce.number().min(10).max(300));

export const exploreQuerySchema = z.object({
  q: loose(z.string().trim().max(80)),
  category: loose(z.string().regex(/^[a-z0-9-]{2,40}$/)),
  occasion: loose(z.enum(OCCASIONS)),
  size: looseList(z.enum(SIZES)),
  locality: loose(z.string().regex(/^[a-z0-9-]{2,40}$/)),
  minPrice: rupeeBound,
  maxPrice: rupeeBound,
  from: loose(z.string().refine(isLocalDate)),
  days: loose(
    z.coerce
      .number()
      .int()
      .refine((d) => (marketplacePolicy.durationOptionsDays as readonly number[]).includes(d)),
  ),
  chestMin: cmBound,
  chestMax: cmBound,
  waistMin: cmBound,
  waistMax: cmBound,
  sort: loose(z.enum(SORTS)),
  page: loose(z.coerce.number().int().min(1).max(200)),
});
export type ExploreQuery = z.infer<typeof exploreQuerySchema>;

export const PAGE_SIZE = 24;
