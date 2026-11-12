import type { Tone } from "@/shared/ui/feedback";
import type { BookingStatus } from "../domain/booking-state-machine";

export const bookingStatusTone: Record<BookingStatus, Tone> = {
  PENDING_APPROVAL: "neutral",
  AWAITING_PAYMENT: "warning",
  CONFIRMED: "success",
  ACTIVE: "brand",
  RETURNED: "olive",
  DISPUTED: "danger",
  COMPLETED: "olive",
  CANCELLED: "neutral",
  REJECTED: "neutral",
  EXPIRED: "neutral",
};
