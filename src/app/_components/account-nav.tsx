"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui/cn";
import { IndexBar, type IndexBarItem, isActive } from "@/shared/ui/index-bar";

/**
 * One account area for both sides of the marketplace: a member rents and lends from the same account, so
 * renting, lending and settings sit in one bar, whatever route group a page lives in.
 */
const sections: ReadonlyArray<IndexBarItem & { pages?: ReadonlyArray<{ href: string; label: string }> }> = [
  { href: "/account/rentals", label: "My rentals" },
  { href: "/lend/dashboard", label: "My outfits", also: ["/lend/outfits"] },
  {
    href: "/lend/requests",
    label: "Rental requests",
    also: ["/lend/history"],
    pages: [
      { href: "/lend/requests", label: "Open requests" },
      { href: "/lend/history", label: "Past rentals" },
    ],
  },
  { href: "/lend/earnings", label: "Earnings" },
  { href: "/account/saved", label: "Saved" },
  {
    href: "/account",
    label: "Profile & settings",
    exact: true,
    also: ["/account/addresses", "/account/notifications", "/account/reviews"],
    pages: [
      { href: "/account", label: "Profile" },
      { href: "/account/notifications", label: "Notifications" },
      { href: "/account/addresses", label: "Addresses" },
      { href: "/account/reviews", label: "Reviews" },
    ],
  },
];

export function AccountNav() {
  const pathname = usePathname();
  const current = sections.find((s) => isActive(pathname, s));
  return (
    <div>
      <IndexBar label="Your account" items={sections} />
      {current?.pages ? (
        <nav aria-label={current.label} className="border-b border-rule">
          <ul className="flex gap-6 overflow-x-auto">
            {current.pages.map((page) => {
              const active = pathname === page.href || pathname.startsWith(`${page.href}/`);
              const exactProfile = page.href === "/account" && pathname !== "/account";
              const on = active && !exactProfile;
              return (
                <li key={page.href} className="shrink-0">
                  <Link
                    href={page.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "block py-3 text-sm no-underline",
                      on ? "text-ink underline underline-offset-4" : "text-graphite hover:text-ink",
                    )}
                  >
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
