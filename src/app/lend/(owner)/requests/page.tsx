import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { BookingList } from "@/modules/bookings/ui/booking-list";
import { EmptyState } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage() {
  const actor = await requireActorOrRedirect("/lend/requests");
  const { bookings } = container();
  const [waiting, inProgress, history] = await Promise.all([
    bookings.myLendings(actor, ["PENDING_APPROVAL"]),
    bookings.myLendings(actor, ["AWAITING_PAYMENT", "CONFIRMED", "ACTIVE", "RETURNED", "DISPUTED"]),
    bookings.myLendings(actor, ["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"]),
  ]);
  const href = (r: { id: string }) => "/lend/requests/" + r.id;
  return (
    <div className="flex flex-col gap-16 pb-16">
      <PageHeader
        eyebrow="Lending"
        title="Requests"
        lede="Answer requests within 24 hours. Approving holds the dates while the renter pays."
      />
      <section aria-labelledby="waiting">
        <SectionIndex index={1}>Needs your answer</SectionIndex>
        <h2 id="waiting" className="sr-only">
          Needs your answer
        </h2>
        <div className="mt-4">
          <BookingList
            rows={waiting}
            hrefFor={href}
            counterpartLabel="Renter"
            empty={<EmptyState title="No requests waiting." />}
          />
        </div>
      </section>
      <section aria-labelledby="progress">
        <SectionIndex index={2}>In progress</SectionIndex>
        <h2 id="progress" className="sr-only">
          In progress
        </h2>
        <div className="mt-4">
          <BookingList
            rows={inProgress}
            hrefFor={href}
            counterpartLabel="Renter"
            empty={<EmptyState title="Nothing in progress." />}
          />
        </div>
      </section>
      <p className="text-sm text-graphite">
        {history.length} finished rental{history.length === 1 ? "" : "s"} in your history.
      </p>
    </div>
  );
}
