import "server-only";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/infrastructure/prisma";
import { PAGE_SIZE, type ExploreQuery } from "../application/contracts";
import type { CatalogueQueries, ExploreResult, OutfitCard, OutfitDetail } from "../application/ports";

const { sql, join, empty, raw } = Prisma;

/** Tokens safe for to_tsquery: letters and digits only, each a prefix match, all required. */
export function toPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

interface CardRow {
  id: string;
  slug: string;
  title: string;
  category_name: string;
  locality_name: string;
  size_label: string;
  occasions: string[];
  price_paise: number;
  price_days: number;
  deposit_paise: number;
  photo_key: string | null;
  photo_alt: string | null;
  owner_name: string;
  total: bigint;
}

function toCard(r: CardRow): OutfitCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    categoryName: r.category_name,
    localityName: r.locality_name,
    sizeLabel: r.size_label,
    occasions: r.occasions,
    pricePaise: r.price_paise,
    priceDays: r.price_days,
    depositPaise: r.deposit_paise,
    photoKey: r.photo_key,
    photoAlt: r.photo_alt,
    ownerName: r.owner_name,
  };
}

/** Shared projection for listing cards; `priceJoin` decides which price option is shown. */
function cardSelect(priceJoin: Prisma.Sql) {
  return sql`
    SELECT o.id, o.slug, o.title, c.name AS category_name, l.name AS locality_name, o.size_label::text AS size_label,
           o.occasions::text[] AS occasions, po.price_paise, po.duration_days AS price_days, o.deposit_paise,
           img.storage_key AS photo_key, img.alt_text AS photo_alt,
           COALESCE(up.display_name, u.name) AS owner_name,
           COUNT(*) OVER () AS total
    FROM outfits o
    JOIN outfit_categories c ON c.id = o.category_id
    JOIN localities l ON l.id = o.locality_id
    JOIN users u ON u.id = o.owner_id
    LEFT JOIN user_profiles up ON up.user_id = o.owner_id
    ${priceJoin}
    LEFT JOIN LATERAL (
      SELECT storage_key, alt_text FROM outfit_images i WHERE i.outfit_id = o.id ORDER BY sort_order LIMIT 1
    ) img ON true`;
}

const cheapestPrice = sql`
  JOIN LATERAL (
    SELECT price_paise, duration_days FROM outfit_price_options p
    WHERE p.outfit_id = o.id AND p.is_active ORDER BY price_paise LIMIT 1
  ) po ON true`;

export function prismaCatalogueQueries(db: Db): CatalogueQueries {
  return {
    async explore(query: ExploreQuery, today: string): Promise<ExploreResult> {
      const page = query.page ?? 1;
      const conditions: Prisma.Sql[] = [sql`o.status = 'ACTIVE' AND u.banned IS NOT TRUE`];

      // Price is compared against the chosen duration when the renter picked one.
      const priceJoin = query.days
        ? sql`JOIN outfit_price_options po ON po.outfit_id = o.id AND po.is_active AND po.duration_days = ${query.days}`
        : cheapestPrice;

      const tsQuery = query.q ? toPrefixTsQuery(query.q) : null;
      if (query.q) {
        const needle = query.q.toLowerCase();
        conditions.push(
          tsQuery
            ? sql`(outfit_search_document(o.title, o.brand, o.colour, o.fabric, o.description) @@ to_tsquery('simple', ${tsQuery})
                   OR word_similarity(${needle}, lower(o.title)) > 0.4)`
            : sql`word_similarity(${needle}, lower(o.title)) > 0.4`,
        );
      }
      if (query.category) {
        conditions.push(
          sql`(c.slug = ${query.category} OR c.parent_id = (SELECT id FROM outfit_categories WHERE slug = ${query.category}))`,
        );
      }
      if (query.occasion) conditions.push(sql`${query.occasion}::"Occasion" = ANY (o.occasions)`);
      if (query.size.length) conditions.push(sql`o.size_label::text IN (${join(query.size)})`);
      if (query.locality) conditions.push(sql`l.slug = ${query.locality}`);
      if (query.minPrice !== undefined) conditions.push(sql`po.price_paise >= ${query.minPrice * 100}`);
      if (query.maxPrice !== undefined) conditions.push(sql`po.price_paise <= ${query.maxPrice * 100}`);

      const measurement = (column: string, min?: number, max?: number) => {
        if (min === undefined && max === undefined) return;
        const col = raw(`m.${column}`); // internal constant, never user input
        conditions.push(sql`EXISTS (SELECT 1 FROM outfit_measurements m WHERE m.outfit_id = o.id
          ${min !== undefined ? sql`AND ${col} >= ${Math.round(min * 10)}` : empty}
          ${max !== undefined ? sql`AND ${col} <= ${Math.round(max * 10)}` : empty})`);
      };
      measurement("chest_mm", query.chestMin, query.chestMax);
      measurement("waist_mm", query.waistMin, query.waistMax);

      // Date availability: the same half-open range a booking would hold (rental + turnaround buffer),
      // tested against every existing hold. The exclusion constraint remains the authority at approval.
      if (query.from && query.from > today) {
        const days = query.days ?? marketplacePolicy.durationOptionsDays[0];
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM calendar_holds h
          WHERE h.outfit_id = o.id
            AND daterange(h.starts_on, h.ends_before, '[)')
                && daterange(${query.from}::date, (${query.from}::date + ${days}::int + o.turnaround_days), '[)'))`);
      }

      const order =
        query.sort === "price-asc"
          ? sql`po.price_paise ASC, o.published_at DESC`
          : query.sort === "price-desc"
            ? sql`po.price_paise DESC, o.published_at DESC`
            : tsQuery && query.sort !== "newest"
              ? sql`ts_rank(outfit_search_document(o.title, o.brand, o.colour, o.fabric, o.description), to_tsquery('simple', ${tsQuery})) DESC, o.published_at DESC`
              : sql`o.published_at DESC NULLS LAST, o.id`;

      const rows = await db.$queryRaw<CardRow[]>`
        ${cardSelect(priceJoin)}
        WHERE ${join(conditions, " AND ")}
        ORDER BY ${order}
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;

      const total = rows.length ? Number(rows[0]!.total) : 0;
      return { items: rows.map(toCard), total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
    },

    categories: () =>
      db.outfitCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, slug: true, name: true, audience: true, description: true },
      }),

    localities: () =>
      db.locality.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { slug: true, name: true },
      }),

    async outfitBySlug(slug): Promise<OutfitDetail | null> {
      const o = await db.outfit.findUnique({
        where: { slug },
        include: {
          category: { select: { slug: true, name: true } },
          locality: { select: { name: true, city: true } },
          images: { orderBy: { sortOrder: "asc" } },
          measurements: true,
          priceOptions: { where: { isActive: true }, orderBy: { durationDays: "asc" } },
          owner: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              emailVerified: true,
              phoneNumberVerified: true,
              banned: true,
              profile: { select: { displayName: true, ownerRatingSum: true, ownerRatingCount: true } },
              _count: { select: { bookingsAsOwner: { where: { status: "COMPLETED" } } } },
            },
          },
        },
      });
      if (!o) return null;
      const m = o.measurements;
      const p = o.owner.profile;
      return {
        id: o.id,
        slug: o.slug,
        title: o.title,
        description: o.description,
        status: o.status,
        brand: o.brand,
        colour: o.colour,
        fabric: o.fabric,
        sizeLabel: o.sizeLabel,
        conditionGrade: o.conditionGrade,
        conditionNotes: o.conditionNotes,
        retailValuePaise: o.retailValuePaise,
        depositPaise: o.depositPaise,
        turnaroundDays: o.turnaroundDays,
        occasions: o.occasions,
        category: o.category,
        locality: o.locality,
        photos: o.images.map((i) => ({
          key: i.storageKey,
          alt: i.altText,
          width: i.width,
          height: i.height,
        })),
        measurementsMm: {
          chest: m?.chestMm ?? null,
          waist: m?.waistMm ?? null,
          hip: m?.hipMm ?? null,
          shoulder: m?.shoulderMm ?? null,
          sleeve: m?.sleeveMm ?? null,
          length: m?.lengthMm ?? null,
          bottomWaist: m?.bottomWaistMm ?? null,
          bottomLength: m?.bottomLengthMm ?? null,
        },
        measurementNotes: m?.notes ?? null,
        prices: o.priceOptions.map((x) => ({ durationDays: x.durationDays, pricePaise: x.pricePaise })),
        owner: {
          id: o.owner.id,
          displayName: p?.displayName ?? o.owner.name,
          memberSince: o.owner.createdAt,
          emailVerified: o.owner.emailVerified,
          phoneVerified: Boolean(o.owner.phoneNumberVerified),
          rating:
            p && p.ownerRatingCount > 0
              ? Math.round((p.ownerRatingSum / p.ownerRatingCount) * 10) / 10
              : null,
          ratingCount: p?.ownerRatingCount ?? 0,
          completedRentals: o.owner._count.bookingsAsOwner,
          suspended: o.owner.banned === true,
        },
        publishedAt: o.publishedAt,
      };
    },

    async savedOutfitIds(userId) {
      const rows = await db.savedOutfit.findMany({ where: { userId }, select: { outfitId: true } });
      return new Set(rows.map((r) => r.outfitId));
    },

    async savedOutfits(userId) {
      const rows = await db.$queryRaw<CardRow[]>`
        ${cardSelect(cheapestPrice)}
        JOIN saved_outfits s ON s.outfit_id = o.id AND s.user_id = ${userId}::uuid
        WHERE o.status = 'ACTIVE' AND u.banned IS NOT TRUE
        ORDER BY s.created_at DESC
        LIMIT 100`;
      return rows.map(toCard);
    },

    async toggleSaved(userId, outfitId) {
      const existing = await db.savedOutfit.findUnique({ where: { userId_outfitId: { userId, outfitId } } });
      if (existing) {
        await db.savedOutfit.delete({ where: { userId_outfitId: { userId, outfitId } } });
        return false;
      }
      await db.savedOutfit.create({ data: { userId, outfitId } });
      return true;
    },

    async recentlyListed(limit) {
      const rows = await db.$queryRaw<CardRow[]>`
        ${cardSelect(cheapestPrice)}
        WHERE o.status = 'ACTIVE' AND u.banned IS NOT TRUE
        ORDER BY o.published_at DESC NULLS LAST
        LIMIT ${limit}`;
      return rows.map(toCard);
    },
  };
}
