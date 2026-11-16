import type { ReactNode } from "react";
import { requireActorOrRedirect } from "@/composition/session";
import { Page } from "@/shared/ui/layout";
import { AccountNav } from "../_components/account-nav";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireActorOrRedirect("/account");
  return (
    <Page className="pt-8">
      <AccountNav />
      {children}
    </Page>
  );
}
