import Link from "next/link";
import { primaryNav, site } from "@/config/site";
import { ButtonLink } from "@/shared/ui/button";
import { MobileNav } from "./mobile-nav";
import { Wordmark } from "./wordmark";

import type { HeaderViewer } from "./viewer";

export type { HeaderViewer };

export function SiteHeader({ viewer }: { viewer: HeaderViewer | null }) {
  return (
    <header className="border-b border-ink bg-paper">
      <div className="border-b border-rule">
        <div className="mx-auto flex h-8 max-w-page items-center justify-between page-x">
          <p className="eyebrow text-graphite">{site.tagline}</p>
          <p className="hidden eyebrow text-graphite sm:block">Rent it · Wear it · Return it</p>
        </div>
      </div>
      <div className="mx-auto flex h-18 max-w-page items-center justify-between gap-6 page-x">
        <Wordmark />
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-sm text-ink no-underline hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-5 lg:flex">
          {viewer ? (
            <>
              {viewer.isAdmin ? (
                <Link href="/admin" className="eyebrow text-burgundy no-underline hover:underline">
                  Admin
                </Link>
              ) : null}
              <Link href="/account" className="text-sm no-underline hover:underline">
                {viewer.displayName}
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm no-underline hover:underline">
                Sign in
              </Link>
              <ButtonLink href="/sign-up" size="sm" variant="secondary">
                Join Peti
              </ButtonLink>
            </>
          )}
        </div>
        <MobileNav viewer={viewer} />
      </div>
    </header>
  );
}
