import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { allowsSelfServiceAccounts, isDevToolingEnabled } from "@/config/env";
import { site } from "@/config/site";
import { getActor } from "@/composition/session";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
};

export const viewport: Viewport = {
  themeColor: "#fbf8f2",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const actor = await getActor();
  const viewer = actor ? { displayName: actor.displayName, isAdmin: actor.isAdmin } : null;
  return (
    <html lang="en-IN" className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        {!allowsSelfServiceAccounts() ? (
          <p className="bg-olive-deep px-4 py-2 text-center text-caption text-paper">
            Demonstration: fictional people and outfits, sandbox payments only. Do not enter real details.
          </p>
        ) : isDevToolingEnabled() ? (
          <p className="bg-olive-deep px-4 py-2 text-center text-caption text-paper" data-testid="poc-banner">
            Local POC: payments, emails and text messages are simulated — nothing is charged or sent.{" "}
            <Link href="/dev" className="text-paper underline">
              Tools
            </Link>{" "}
            ·{" "}
            <Link href="/dev/outbox" className="text-paper underline">
              Outbox
            </Link>
          </p>
        ) : null}
        <SiteHeader viewer={viewer} canJoin={allowsSelfServiceAccounts()} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
