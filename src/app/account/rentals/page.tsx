import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { BookingList } from "@/modules/bookings/ui/booking-list";
import { ButtonLink } from "@/shared/ui/button";
import { EmptyState, Notice } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Your rentals" };

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/account/rentals");
  const rows = await container().bookings.myRentals(actor);
  const params = await searchParams;
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Renting" title="Your rentals" />
      {params.payment === "invalid" || params.payment === "error" ? (
        <Notice tone="danger" title="We could not verify that payment" className="mt-8">
          If money left your account, it will be confirmed or refunded automatically.
        </Notice>
      ) : null}
      <div className="mt-10">
        <BookingList
          rows={rows}
          hrefFor={(r) => "/account/rentals/" + r.id}
          counterpartLabel="Lent by"
          empty={
            <EmptyState
              title="No rentals yet."
              action={<ButtonLink href="/explore">Explore outfits</ButtonLink>}
            >
              When you request an outfit, it appears here with its status.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}
