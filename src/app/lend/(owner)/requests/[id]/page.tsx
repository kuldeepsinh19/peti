import type { Metadata } from "next";
import { requireActorOrRedirect } from "@/composition/session";
import { BookingPage } from "../../../../_components/booking-page";

export const metadata: Metadata = { title: "Booking" };

export default async function LendingBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const actor = await requireActorOrRedirect("/lend/requests/" + id);
  return (
    <BookingPage
      actor={actor}
      bookingId={id}
      returnTo={"/lend/requests/" + id}
      searchParams={await searchParams}
    />
  );
}
