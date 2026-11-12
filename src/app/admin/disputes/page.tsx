import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { formatLocalDate, type LocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { EmptyState } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

export const metadata: Metadata = { title: "Disputes" };

export default async function AdminDisputesPage() {
  const actor = await requireAdminOrNotFound();
  const rows = await container().admin.openDisputes(actor);
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader
        eyebrow="Administration"
        title="Open disputes"
        lede="Oldest first. Each booking page shows the handover and return reports side by side, the messages, and the decision form."
      />
      <Ledger
        caption="Open disputes"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No open disputes." />}
        columns={[
          {
            key: "ref",
            header: "Booking",
            cell: (r) => (
              <Link href={"/admin/bookings/" + r.id} className="numeral">
                {r.reference}
              </Link>
            ),
          },
          { key: "outfit", header: "Outfit", cell: (r) => r.outfitTitle },
          { key: "people", header: "Owner → renter", cell: (r) => r.ownerName + " → " + r.renterName },
          { key: "start", header: "Started", cell: (r) => formatLocalDate(r.startDate as LocalDate) },
          { key: "total", header: "Held", align: "right", cell: (r) => formatInr(r.renterTotalPaise) },
        ]}
      />
    </div>
  );
}
