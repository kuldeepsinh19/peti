import Link from "next/link";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { occasionLabel, sizeLabel } from "@/shared/ui/labels";
import type { ExploreQuery } from "../application/contracts";

const field = "flex min-w-0 flex-col gap-1 border-b border-rule py-3 lg:border-b-0 lg:border-r lg:px-4";
const control = "w-full border-0 bg-transparent p-0 text-sm text-ink focus:outline-none";
const label = "eyebrow text-graphite";

/**
 * Filters as one horizontal row of text controls (no sidebar). A plain GET form: every search is a
 * shareable URL and works without JavaScript. Less common filters sit behind a native disclosure.
 */
export function FilterRow({
  query,
  categories,
  localities,
  action = "/explore",
  lockCategory,
  total,
}: {
  query: ExploreQuery;
  categories: ReadonlyArray<{ slug: string; name: string }>;
  localities: ReadonlyArray<{ slug: string; name: string }>;
  action?: string;
  lockCategory?: string;
  total: number;
}) {
  return (
    <form action={action} method="get" className="border-y border-ink" aria-label="Filter outfits">
      <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.7fr_1fr_1fr_auto]">
        <label className={`${field} col-span-2 lg:col-span-1 lg:pl-0`}>
          <span className={label}>Keyword</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Banarasi, sherwani…"
            className={control}
          />
        </label>
        {lockCategory ? (
          <input type="hidden" name="category" value={lockCategory} />
        ) : (
          <label className={field}>
            <span className={label}>Category</span>
            <select name="category" defaultValue={query.category ?? ""} className={control}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={field}>
          <span className={label}>Occasion</span>
          <select name="occasion" defaultValue={query.occasion ?? ""} className={control}>
            <option value="">Any</option>
            {Object.entries(occasionLabel).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className={label}>Size</span>
          <select name="size" defaultValue={query.size[0] ?? ""} className={control}>
            <option value="">Any</option>
            {Object.entries(sizeLabel).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className={label}>Locality</span>
          <select name="locality" defaultValue={query.locality ?? ""} className={control}>
            <option value="">All Ahmedabad</option>
            {localities.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className={label}>Wearing it from</span>
          <input type="date" name="from" defaultValue={query.from ?? ""} className={control} />
        </label>
        <div className="col-span-2 flex items-center justify-between gap-4 py-3 lg:col-span-1 lg:pl-4">
          <span className="text-sm text-graphite numeral lg:hidden" aria-live="polite">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
          <button
            type="submit"
            className="h-10 bg-burgundy px-6 text-sm font-medium text-paper hover:bg-burgundy-light"
          >
            Apply
          </button>
        </div>
      </div>
      <details className="group border-t border-rule">
        <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-graphite marker:hidden">
          <span>
            More filters — duration, price, measurements, order{" "}
            <span aria-hidden className="inline-block transition-transform group-open:rotate-180">
              ▾
            </span>
          </span>
          <span className="hidden text-graphite numeral lg:inline" aria-live="polite">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pb-5 md:grid-cols-4 lg:grid-cols-8">
          <label className="flex flex-col gap-1">
            <span className={label}>For</span>
            <select name="days" defaultValue={query.days ? String(query.days) : ""} className={control}>
              <option value="">Any duration</option>
              {marketplacePolicy.durationOptionsDays.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <NumberInput name="minPrice" text="Min ₹" value={query.minPrice} />
          <NumberInput name="maxPrice" text="Max ₹" value={query.maxPrice} />
          <NumberInput name="chestMin" text="Chest from (cm)" value={query.chestMin} />
          <NumberInput name="chestMax" text="Chest to (cm)" value={query.chestMax} />
          <NumberInput name="waistMin" text="Waist from (cm)" value={query.waistMin} />
          <NumberInput name="waistMax" text="Waist to (cm)" value={query.waistMax} />
          <label className="flex flex-col gap-1">
            <span className={label}>Order</span>
            <select name="sort" defaultValue={query.sort ?? ""} className={control}>
              <option value="">Most relevant</option>
              <option value="newest">Newest</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
            </select>
          </label>
        </div>
        <p className="pb-4 text-sm">
          <Link href={lockCategory ? `/categories/${lockCategory}` : "/explore"} className="text-burgundy">
            Clear all filters
          </Link>
        </p>
      </details>
    </form>
  );
}

function NumberInput({ name, text, value }: { name: string; text: string; value: number | undefined }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={label}>{text}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        name={name}
        defaultValue={value ?? ""}
        className="w-full border-0 border-b border-rule bg-transparent p-0 py-1 text-sm focus:border-ink focus:outline-none"
      />
    </label>
  );
}
