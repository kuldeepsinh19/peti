import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { site } from "@/config/site";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <SiteHeader viewer={null} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
