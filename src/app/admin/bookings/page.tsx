import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { BOOKING_STATUSES, statusLabel, type BookingStatus } from "@/modules/bookings";
import { bookingStatusTone } from "@/modules/bookings/ui/status";
import { formatLocalDate, type LocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { EmptyState, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

export const metadata: Metadata = { title: "Bookings" };

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminOrNotFound();
  const params = await searchParams;
  const status =
    typeof params.status === "string" && (BOOKING_STATUSES as readonly string[]).includes(params.status)
      ? params.status
      : undefined;
  const rows = await container().admin.bookings(actor, status);
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader eyebrow="Administration" title="Bookings" />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin/bookings" className={!status ? "text-ink" : "text-graphite"}>
          All
        </Link>
        {BOOKING_STATUSES.map((s) => (
          <Link
            key={s}
            href={"/admin/bookings?status=" + s}
            className={status === s ? "text-ink" : "text-graphite"}
          >
            {statusLabel[s]}
          </Link>
        ))}
      </nav>
      <Ledger
        caption="Bookings"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No bookings." />}
        columns={[
          {
            key: "ref",
            header: "Reference",
            cell: (r) => (
              <Link href={"/admin/bookings/" + r.id} className="numeral">
                {r.reference}
              </Link>
            ),
          },
          { key: "outfit", header: "Outfit", cell: (r) => r.outfitTitle },
          { key: "people", header: "Owner → renter", cell: (r) => r.ownerName + " → " + r.renterName },
          { key: "start", header: "Starts", cell: (r) => formatLocalDate(r.startDate as LocalDate) },
          {
            key: "status",
            header: "Status",
            cell: (r) => (
              <Tag tone={bookingStatusTone[r.status as BookingStatus]}>
                {statusLabel[r.status as BookingStatus]}
              </Tag>
            ),
          },
          { key: "total", header: "Total", align: "right", cell: (r) => formatInr(r.renterTotalPaise) },
        ]}
      />
    </div>
  );
}
