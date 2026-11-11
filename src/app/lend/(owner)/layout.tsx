import type { ReactNode } from "react";
import { requireActorOrRedirect } from "@/composition/session";
import { IndexBar } from "@/shared/ui/index-bar";
import { Page } from "@/shared/ui/layout";

export const dynamic = "force-dynamic";

const items = [
  { href: "/lend/dashboard", label: "Your outfits" },
  { href: "/lend/requests", label: "Requests" },
  { href: "/lend/history", label: "Rental history" },
  { href: "/lend/earnings", label: "Earnings" },
  { href: "/lend/outfits/new", label: "List an outfit" },
];

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await requireActorOrRedirect("/lend/dashboard");
  return (
    <Page className="pt-8">
      <IndexBar label="Lending" items={items} />
      {children}
    </Page>
  );
}
