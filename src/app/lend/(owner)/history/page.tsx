import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { BookingList } from "@/modules/bookings/ui/booking-list";
import { EmptyState } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Past rentals" };

export default async function HistoryPage() {
  const actor = await requireActorOrRedirect("/lend/history");
  const rows = await container().bookings.myLendings(actor, [
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
  ]);
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Lending" title="Past rentals" />
      <div className="mt-10">
        <BookingList
          rows={rows}
          hrefFor={(r) => "/lend/requests/" + r.id}
          counterpartLabel="Renter"
          empty={<EmptyState title="No finished rentals yet." />}
        />
      </div>
    </div>
  );
}
