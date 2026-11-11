import type { ReactNode } from "react";
import { requireAdminOrNotFound } from "@/composition/session";
import { IndexBar } from "@/shared/ui/index-bar";
import { Page } from "@/shared/ui/layout";

export const dynamic = "force-dynamic";

const items = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/activity", label: "Activity" },
];

/** Every admin page and action re-checks the role on the server; this layout only adds navigation. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminOrNotFound();
  return (
    <Page className="pt-8">
      <p className="mb-2 eyebrow text-burgundy">Administration</p>
      <IndexBar label="Administration" items={items} />
      {children}
    </Page>
  );
}
