import type { Metadata } from "next";
import { requireAdminOrNotFound } from "@/composition/session";
import { BookingPage } from "../../../_components/booking-page";

export const metadata: Metadata = { title: "Booking" };

export default async function AdminBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const actor = await requireAdminOrNotFound();
  return (
    <BookingPage
      actor={actor}
      bookingId={id}
      returnTo={"/admin/bookings/" + id}
      searchParams={await searchParams}
    />
  );
}
