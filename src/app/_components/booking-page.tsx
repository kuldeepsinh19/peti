import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { BookingView } from "@/modules/bookings/ui/booking-view";
import type { UserActor } from "@/shared/application/actor";
import { DomainError } from "@/shared/domain/errors";
import { localDateInIndia } from "@/shared/domain/local-date";
import { bookingCommandAction, conditionReportAction, startCheckoutAction } from "../_actions/bookings";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Loads a booking for the signed-in participant (or an admin) and renders the shared booking view. */
export async function BookingPage({
  actor,
  bookingId,
  returnTo,
  searchParams,
}: {
  actor: UserActor;
  bookingId: string;
  returnTo: string;
  searchParams: Search;
}) {
  const { bookings, clock } = container();
  const booking = await bookings.detail(actor, bookingId).catch((error: unknown) => {
    if (error instanceof DomainError) notFound();
    throw error;
  });
  const now = clock.now();
  const flash = {
    done: one(searchParams.done),
    error: one(searchParams.error),
    payment: one(searchParams.payment),
  };
  return (
    <BookingView
      booking={booking}
      returnTo={returnTo}
      today={localDateInIndia(now)}
      now={now}
      command={bookingCommandAction}
      report={conditionReportAction}
      checkout={startCheckoutAction.bind(null, booking.id)}
      flash={flash}
    />
  );
}
