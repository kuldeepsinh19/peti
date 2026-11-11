"use client";

import Link from "next/link";
import { useState } from "react";
import { primaryNav } from "@/config/site";
import { Sheet } from "@/shared/ui/overlay";
import type { HeaderViewer } from "./viewer";

export function MobileNav({ viewer }: { viewer: HeaderViewer | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const links = [
    ...primaryNav,
    ...(viewer
      ? [
          { href: "/account", label: "Your account" },
          { href: "/account/rentals", label: "Your rentals" },
          { href: "/lend/dashboard", label: "Your lending" },
          ...(viewer.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
        ]
      : [
          { href: "/sign-in", label: "Sign in" },
          { href: "/sign-up", label: "Join Peti" },
        ]),
  ];
  return (
    <div className="lg:hidden">
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Menu"
        trigger={
          <button type="button" className="border border-ink px-3 py-2 eyebrow text-ink">
            Menu
          </button>
        }
      >
        <nav aria-label="Mobile">
          <ol className="flex flex-col">
            {links.map((item, i) => (
              <li key={item.href} className="border-b border-rule">
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex items-baseline gap-4 py-4 font-display text-2xl no-underline"
                >
                  <span className="eyebrow text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </Sheet>
    </div>
  );
}
