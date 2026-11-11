import Link from "next/link";
import type { ExploreQuery, ExploreResult } from "@/modules/search";
import { OutfitGrid } from "@/modules/search/ui/outfit-grid";
import { EmptyState } from "@/shared/ui/feedback";

/** Results with pagination links that keep the current filters. */
export function Results({
  query,
  result,
  basePath,
}: {
  query: ExploreQuery;
  result: ExploreResult;
  basePath: string;
}) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="Nothing matches — yet."
        className="mt-12"
        action={<Link href={basePath}>Clear the filters</Link>}
      >
        Try fewer filters, another date or a nearby locality. New outfits are added by lenders across
        Ahmedabad.
      </EmptyState>
    );
  }
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "page" || key === "category" || value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
      else params.set(key, String(value));
    }
    if (query.category && basePath === "/explore") params.set("category", query.category);
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <>
      <div className="mt-12">
        <OutfitGrid items={result.items} priority />
      </div>
      {result.pageCount > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-16 flex items-center justify-between border-t border-ink pt-4 text-sm"
        >
          {result.page > 1 ? <Link href={pageHref(result.page - 1)}>← Previous</Link> : <span />}
          <span className="eyebrow text-graphite numeral">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? <Link href={pageHref(result.page + 1)}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
