import Link from "next/link";
import { site } from "@/config/site";
import { Wordmark } from "./wordmark";

const columns = [
  {
    title: "Rent",
    links: [
      { href: "/explore", label: "Explore outfits" },
      { href: "/categories/sherwani", label: "Sherwanis" },
      { href: "/categories/lehenga", label: "Lehengas" },
      { href: "/categories/saree", label: "Sarees" },
    ],
  },
  {
    title: "Lend",
    links: [
      { href: "/lend", label: "Lend an outfit" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/lend/dashboard", label: "Lending dashboard" },
    ],
  },
  {
    title: "Peti",
    links: [
      { href: "/about", label: "About" },
      { href: "/trust-and-safety", label: "Trust & safety" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-(--spacing-section) bg-ink text-paper">
      <div className="mx-auto grid max-w-page gap-12 page-x py-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="[&_span]:text-paper [&_span+span]:text-sand-deep">
            <Wordmark />
          </div>
          <p className="mt-6 max-w-sm text-sm text-sand">
            A peer-to-peer marketplace where people in {site.launchCity} lend the occasionwear they own. Peti
            never owns, stores or ships garments.
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="lg:col-span-2">
            <p className="eyebrow text-sand-deep">{col.title}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-paper no-underline hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-paper/20">
        <div className="mx-auto max-w-page page-x py-6 text-caption text-sand">
          <p>Models shown in photographs are not Peti users.</p>
        </div>
      </div>
    </footer>
  );
}
