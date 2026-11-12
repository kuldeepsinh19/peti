import type { LocalDate } from "@/shared/domain/local-date";
import type { BookingStatus } from "../domain/booking-state-machine";
import type { SweepCandidates } from "./sweep";

export interface BookingListRow {
  id: string;
  reference: string;
  status: BookingStatus;
  startDate: LocalDate;
  endDate: LocalDate;
  rentalDays: number;
  outfitTitle: string;
  outfitSlug: string;
  photoKey: string | null;
  counterpartName: string;
  renterTotalPaise: number;
  rentalFeePaise: number;
  depositPaise: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ConditionReportView {
  kind: "HANDOVER" | "RETURN";
  grade: string;
  notes: string;
  authorName: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  counterpartyNotes: string | null;
  photoKeys: string[];
}

export interface BookingDetail {
  id: string;
  reference: string;
  status: BookingStatus;
  closedReason: string | null;
  outfit: { id: string; title: string; slug: string; photoKey: string | null; localityName: string };
  owner: { id: string; name: string; phone: string | null };
  renter: { id: string; name: string; phone: string | null };
  pickupAddress: string | null;
  startDate: LocalDate;
  endDate: LocalDate;
  rentalDays: number;
  bufferDays: number;
  expiresAt: Date | null;
  renterNote: string | null;
  money: {
    rentalFeePaise: number;
    depositPaise: number;
    commissionPaise: number;
    renterTotalPaise: number;
    ownerPayoutPaise: number;
    lateFeePerDayPaise: number;
    lateFeePaise: number | null;
    lateDays: number | null;
  };
  payment: {
    id: string;
    status: string;
    provider: string;
    amountPaise: number;
    refundedPaise: number;
    capturedAt: Date | null;
  } | null;
  deposit: {
    status: string;
    withheldPaise: number;
    lateFeePaise: number;
    damagePaise: number;
    settledAt: Date | null;
  } | null;
  refunds: Array<{ id: string; reason: string; amountPaise: number; status: string; createdAt: Date }>;
  payout: {
    status: string;
    netPaise: number;
    commissionPaise: number;
    grossRentalPaise: number;
    depositWithheldPaise: number;
    paidAt: Date | null;
    reference: string | null;
  } | null;
  reports: ConditionReportView[];
  dispute: {
    id: string;
    kind: string;
    description: string;
    status: string;
    openedByRole: string;
    openedById: string | null;
    openedFromStatus: string;
    claimedAmountPaise: number | null;
    resolution: string | null;
    resolutionNotes: string | null;
    messages: Array<{ authorName: string; body: string; createdAt: Date }>;
  } | null;
  history: Array<{
    toStatus: string;
    command: string;
    actorRole: string;
    reason: string | null;
    createdAt: Date;
  }>;
  inspectionDeadline: Date | null;
  approvedAt: Date | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  policy: unknown;
  createdAt: Date;
}

export interface CalendarEntry {
  id: string;
  kind: "BOOKING" | "OWNER_BLOCK";
  startsOn: LocalDate;
  endsBefore: LocalDate;
  note: string | null;
  bookingReference: string | null;
  bookingStatus: BookingStatus | null;
}

export interface PayoutRow {
  bookingId: string;
  reference: string;
  outfitTitle: string;
  grossRentalPaise: number;
  commissionPaise: number;
  depositWithheldPaise: number;
  netPaise: number;
  status: string;
  paidAt: Date | null;
  payoutReference: string | null;
  createdAt: Date;
}

export interface BookingQueries extends SweepCandidates {
  payoutsForOwner(userId: string): Promise<PayoutRow[]>;
  forRenter(userId: string): Promise<BookingListRow[]>;
  forOwner(userId: string, statuses?: readonly BookingStatus[]): Promise<BookingListRow[]>;
  detail(bookingId: string): Promise<BookingDetail | null>;
  calendar(outfitId: string): Promise<CalendarEntry[]>;
  isParticipant(userId: string, bookingId: string): Promise<boolean>;
  bookingIdForReportPhoto(storageKey: string): Promise<string | null>;
}
