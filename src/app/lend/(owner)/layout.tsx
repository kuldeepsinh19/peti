import type { ReactNode } from "react";
import { requireActorOrRedirect } from "@/composition/session";
import { Page } from "@/shared/ui/layout";
import { AccountNav } from "../../_components/account-nav";

export const dynamic = "force-dynamic";

/** Lending pages share the account bar: one account rents and lends. */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await requireActorOrRedirect("/lend/dashboard");
  return (
    <Page className="pt-8">
      <AccountNav />
      {children}
    </Page>
  );
}
