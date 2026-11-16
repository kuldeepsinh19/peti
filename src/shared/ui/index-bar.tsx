"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

export interface IndexBarItem {
  href: string;
  label: string;
  /** Active only on `href` itself, not on pages below it. */
  exact?: boolean;
  /** Other path prefixes that belong to this item (for a section spread over several routes). */
  also?: readonly string[];
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isActive(pathname: string, item: IndexBarItem): boolean {
  if (item.exact ? pathname === item.href : under(pathname, item.href)) return true;
  return (item.also ?? []).some((prefix) => under(pathname, prefix));
}

/**
 * Section navigation for account, lending and admin areas: a numbered row of text links under the page
 * header — the editorial replacement for a dashboard sidebar. Scrolls horizontally on small screens.
 */
export function IndexBar({ label, items }: { label: string; items: ReadonlyArray<IndexBarItem> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-b border-ink">
      <ol className="-mb-px flex gap-8 overflow-x-auto">
        {items.map((item, i) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-baseline gap-2 border-b-2 py-4 text-sm no-underline",
                  active ? "border-burgundy text-ink" : "border-transparent text-graphite hover:text-ink",
                )}
              >
                <span className="eyebrow text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
