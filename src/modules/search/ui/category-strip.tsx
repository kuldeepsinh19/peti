import Link from "next/link";
import { cn } from "@/shared/ui/cn";
import type { CategoryOption } from "../application/ports";

/**
 * The categories as a row of text links above the filters: the quickest way in for someone who knows what
 * they want to wear. Categories are managed by administrators, so this lists whatever is active.
 */
export function CategoryStrip({
  categories,
  active,
}: {
  categories: readonly CategoryOption[];
  active?: string | undefined;
}) {
  if (categories.length === 0) return null;
  const item = (href: string, label: string, current: boolean) => (
    <li key={href} className="shrink-0">
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "block border-b-2 py-3 font-display text-lg no-underline",
          current ? "border-burgundy text-ink" : "border-transparent text-graphite hover:text-ink",
        )}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <nav aria-label="Categories" className="mb-8 border-b border-rule">
      <ul className="-mb-px flex gap-7 overflow-x-auto">
        {item("/explore", "Everything", !active)}
        {categories.map((c) => item(`/explore?category=${c.slug}`, c.name, active === c.slug))}
      </ul>
    </nav>
  );
}
