import type { AuditEntry } from "@/shared/application/audit";
import type { RateLimiter } from "@/shared/application/rate-limiter";
import type { Clock } from "@/shared/domain/clock";
import type { LocalDate } from "@/shared/domain/local-date";
import type { NotificationDraft } from "@/modules/notifications";
import type { PolicySnapshot, PricingSnapshot } from "../domain/booking-rules";
import type { BookingActorRole, BookingCommand, BookingStatus } from "../domain/booking-state-machine";

export interface BookingRecord {
  id: string;
  reference: string;
  outfitId: string;
  outfitTitle: string;
  outfitSlug: string;
  ownerId: string;
  renterId: string;
  startDate: LocalDate;
  endDate: LocalDate;
  rentalDays: number;
  bufferDays: number;
  status: BookingStatus;
  expiresAt: Date | null;
  rentalFeePaise: number;
  depositPaise: number;
  commissionRateBps: number;
  renterTotalPaise: number;
  lateFeePerDayPaise: number;
  lateFeePaise: number | null;
  policy: PolicySnapshot;
  handedOverAt: Date | null;
  inspectionDeadline: Date | null;
}

export interface LockedOutfit {
  id: string;
  ownerId: string;
  status: string;
  title: string;
  depositPaise: number;
  turnaroundDays: number;
  /** The owner's account is suspended: the outfit cannot be requested. */
  ownerSuspended: boolean;
}

export interface NewBooking {
  reference: string;
  outfitId: string;
  ownerId: string;
  renterId: string;
  startDate: LocalDate;
  endDate: LocalDate;
  rentalDays: number;
  bufferDays: number;
  priceOptionId: string;
  pricing: PricingSnapshot;
  policy: PolicySnapshot;
  termsVersion: string;
  expiresAt: Date;
  renterNote: string | null;
  requestedAt: Date;
}

/** Columns a transition may set alongside the status. */
export interface BookingPatch {
  expiresAt?: Date | null;
  closedReason?:
    | "OWNER_DECLINED"
    | "DATES_UNAVAILABLE"
    | "APPROVAL_TIMEOUT"
    | "PAYMENT_TIMEOUT"
    | "RENTER_CANCELLED"
    | "OWNER_CANCELLED"
    | "ADMIN_CANCELLED"
    | "DISPUTE_RESOLUTION";
  approvedAt?: Date;
  ownerAcceptedAt?: Date;
  confirmedAt?: Date;
  handedOverAt?: Date;
  returnedAt?: Date;
  returnedOn?: LocalDate;
  lateDays?: number;
  lateFeePaise?: number;
  inspectionDeadline?: Date | null;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface HistoryEntry {
  bookingId: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  command: BookingCommand | "request";
  actorRole: BookingActorRole;
  actorUserId: string | null;
  reason?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PaymentRow {
  id: string;
  provider: string;
  status: "CREATED" | "AUTHORIZED" | "CAPTURED" | "ABANDONED";
  amountPaise: number;
  refundedPaise: number;
  providerPaymentId: string | null;
}

export interface ConditionReportRow {
  id: string;
  kind: "HANDOVER" | "RETURN";
  authorId: string;
  photoCount: number;
  acknowledgedAt: Date | null;
  lockedAt: Date | null;
}

export type RefundReason =
  "CANCELLATION" | "DEPOSIT_RELEASE" | "DISPUTE_RESOLUTION" | "LATE_CAPTURE_REVERSAL";
export type SettlementBasis =
  | "AUTO_NO_CLAIM"
  | "OWNER_CONFIRMED"
  | "RESPONDENT_ACCEPTED"
  | "WITHDRAWN"
  | "ADMIN_DECISION"
  | "CANCELLATION";

/**
 * Everything a booking command may read or write, bound to one database transaction. The Prisma
 * implementation takes row locks in the documented order: outfit → booking → payment.
 */
export interface BookingStore {
  /** Reads the outfit; with `lock` (default) takes FOR NO KEY UPDATE to serialise hold-taking commands. */
  lockOutfit(outfitId: string, lock?: boolean): Promise<LockedOutfit | null>;
  findPriceOption(outfitId: string, durationDays: number): Promise<{ id: string; pricePaise: number } | null>;
  isRangeFree(outfitId: string, startsOn: LocalDate, endsBefore: LocalDate): Promise<boolean>;
  insertBooking(booking: NewBooking): Promise<string>;
  getBooking(bookingId: string, opts?: { lock?: boolean }): Promise<BookingRecord | null>;
  /** Compare-and-swap status update; false when the booking was no longer in `from`. */
  updateStatus(
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
    patch: BookingPatch,
  ): Promise<boolean>;
  appendHistory(entry: HistoryEntry): Promise<number>;
  /** Inserts the calendar hold; false when the exclusion constraint finds an overlap. */
  insertHold(
    bookingId: string,
    outfitId: string,
    startsOn: LocalDate,
    endsBefore: LocalDate,
    createdBy: string,
  ): Promise<boolean>;
  deleteHold(bookingId: string): Promise<void>;
  /** Owner block on the same exclusion constraint as bookings; null when it overlaps an existing hold. */
  insertBlock(
    outfitId: string,
    startsOn: LocalDate,
    endsBefore: LocalDate,
    note: string | null,
    createdBy: string,
  ): Promise<string | null>;
  deleteBlock(holdId: string, outfitId: string): Promise<boolean>;
  pendingOverlapping(
    outfitId: string,
    startsOn: LocalDate,
    endsBefore: LocalDate,
    exceptBookingId?: string,
  ): Promise<string[]>;

  getPayment(bookingId: string, opts?: { lock?: boolean }): Promise<PaymentRow | null>;
  markPaymentCaptured(
    paymentId: string,
    providerPaymentId: string,
    method: string | null,
    at: Date,
  ): Promise<void>;
  abandonPayment(bookingId: string): Promise<void>;
  createHeldDeposit(bookingId: string, paymentId: string, amountPaise: number): Promise<void>;
  settleDeposit(
    bookingId: string,
    outcome: {
      status: "RELEASED" | "PARTIALLY_WITHHELD" | "FORFEITED";
      lateFeePaise: number;
      damagePaise: number;
      withheldPaise: number;
      basis: SettlementBasis;
      at: Date;
    },
  ): Promise<void>;
  insertRefund(refund: {
    paymentId: string;
    bookingId: string;
    reason: RefundReason;
    amountPaise: number;
    rentalFeePortionPaise: number;
    depositPortionPaise: number;
    initiatedByRole: BookingActorRole;
    initiatedByUserId: string | null;
  }): Promise<void>;
  insertPayout(payout: {
    bookingId: string;
    ownerId: string;
    grossRentalPaise: number;
    commissionPaise: number;
    depositWithheldPaise: number;
    netPaise: number;
  }): Promise<void>;
  incrementOwnerCancellations(ownerId: string): Promise<void>;

  getConditionReport(bookingId: string, kind: "HANDOVER" | "RETURN"): Promise<ConditionReportRow | null>;
  saveConditionReport(report: {
    bookingId: string;
    kind: "HANDOVER" | "RETURN";
    authorId: string;
    grade: string;
    notes: string;
    photos: Array<{ storageKey: string; caption: string | null }>;
  }): Promise<void>;
  acknowledgeReport(reportId: string, userId: string, at: Date, notes: string | null): Promise<void>;

  hasOpenDispute(bookingId: string): Promise<boolean>;
  insertDispute(dispute: {
    bookingId: string;
    openedById: string | null;
    openedByRole: BookingActorRole;
    openedFromStatus: BookingStatus;
    kind: string;
    description: string;
    claimedAmountPaise: number | null;
  }): Promise<string>;
  getOpenDispute(bookingId: string): Promise<{
    id: string;
    openedById: string | null;
    openedByRole: BookingActorRole;
    openedFromStatus: BookingStatus;
    kind: string;
    claimedAmountPaise: number | null;
  } | null>;
  resolveDispute(
    disputeId: string,
    resolution: {
      resolution: "RESPONDENT_ACCEPTED" | "WITHDRAWN" | "ADMIN_DECISION";
      resolvedById: string | null;
      at: Date;
      notes: string | null;
      awardedDepositPaise: number;
      rentalRefundPaise: number;
    },
  ): Promise<void>;
  addDisputeMessage(disputeId: string, authorId: string, body: string): Promise<void>;

  notify(drafts: readonly NotificationDraft[]): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface ReportPhotoStore {
  save(bookingId: string, bytes: Uint8Array): Promise<string>;
}

export interface BookingsDeps {
  uow: { run<T>(work: (store: BookingStore) => Promise<T>): Promise<T> };
  clock: Clock;
  rateLimiter: RateLimiter;
  reportPhotos: ReportPhotoStore;
  /** Before expiring an unpaid booking, ask the payment provider whether the order was paid after all. */
  paymentReconciler?: { reconcile(bookingId: string): Promise<void> };
}
