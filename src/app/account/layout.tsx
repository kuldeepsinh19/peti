import type { ReactNode } from "react";
import { requireActorOrRedirect } from "@/composition/session";
import { IndexBar } from "@/shared/ui/index-bar";
import { Page } from "@/shared/ui/layout";

export const dynamic = "force-dynamic";

const items = [
  { href: "/account", label: "Profile", exact: true },
  { href: "/account/rentals", label: "Your rentals" },
  { href: "/account/saved", label: "Saved" },
  { href: "/account/reviews", label: "Reviews" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/notifications", label: "Notifications" },
];

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireActorOrRedirect("/account");
  return (
    <Page className="pt-8">
      <IndexBar label="Account" items={items} />
      {children}
    </Page>
  );
}
