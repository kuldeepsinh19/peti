"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

/**
 * Section navigation for account, lending and admin areas: a numbered row of text links under the page
 * header — the editorial replacement for a dashboard sidebar. Scrolls horizontally on small screens.
 */
export function IndexBar({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{ href: string; label: string; exact?: boolean }>;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-b border-ink">
      <ol className="-mb-px flex gap-8 overflow-x-auto">
        {items.map((item, i) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
