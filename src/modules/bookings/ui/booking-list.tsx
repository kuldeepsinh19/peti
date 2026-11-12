import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { fileUrl } from "@/modules/media";
import { formatLocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { Tag } from "@/shared/ui/feedback";
import { Ledger } from "@/shared/ui/ledger";
import type { BookingListRow } from "../application/queries";
import { statusLabel } from "../domain/booking-state-machine";
import { bookingStatusTone } from "./status";

export function BookingList({
  rows,
  hrefFor,
  counterpartLabel,
  empty,
}: {
  rows: BookingListRow[];
  hrefFor: (row: BookingListRow) => string;
  counterpartLabel: string;
  empty: ReactNode;
}) {
  return (
    <Ledger
      caption="Bookings"
      rows={rows}
      rowKey={(r) => r.id}
      empty={empty}
      columns={[
        {
          key: "photo",
          header: "",
          className: "md:w-16",
          cell: (r) =>
            r.photoKey ? (
              <span className="relative block aspect-[3/4] w-12 overflow-hidden bg-sand">
                <Image src={fileUrl(r.photoKey)} alt="" fill sizes="48px" className="object-cover" />
              </span>
            ) : null,
        },
        {
          key: "outfit",
          header: "Outfit",
          cell: (r) => (
            <Link href={hrefFor(r)} className="font-display text-lg">
              {r.outfitTitle}
              <span className="block font-sans text-caption text-stone numeral">{r.reference}</span>
            </Link>
          ),
        },
        {
          key: "dates",
          header: "Dates",
          cell: (r) => formatLocalDate(r.startDate) + " – " + formatLocalDate(r.endDate),
        },
        { key: "who", header: counterpartLabel, cell: (r) => r.counterpartName },
        {
          key: "status",
          header: "Status",
          cell: (r) => <Tag tone={bookingStatusTone[r.status]}>{statusLabel[r.status]}</Tag>,
        },
        { key: "total", header: "Total", align: "right", cell: (r) => formatInr(r.renterTotalPaise) },
      ]}
    />
  );
}
