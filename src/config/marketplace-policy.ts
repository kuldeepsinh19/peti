/**
 * Marketplace policy defaults. These are product assumptions (see docs/product/assumptions-and-risks.md),
 * not legal advice. The values are snapshotted onto every booking at request time, so changing them here
 * never alters an existing rental agreement — bump `version` whenever a value changes.
 *
 * Pure data: imported by domain code, so it must not import anything.
 */
export const marketplacePolicy = {
  version: "2026-11-v1",
  currency: "INR",
  timeZone: "Asia/Kolkata",

  /** Durations an owner may price. A booking uses exactly one of them. */
  durationOptionsDays: [2, 3, 5, 7],
  /** Earliest start is this many calendar days after "today" in IST (leaves time to approve and pay). */
  minLeadDays: 2,
  maxAdvanceDays: 180,

  /** Owner must answer within this many hours of the request… */
  approvalWindowHours: 24,
  /** …and in any case no later than this many hours before the start date begins (00:00 IST). */
  approvalCutoffHoursBeforeStart: 12,
  /** Renter must pay within this many hours of approval… */
  paymentWindowHours: 12,
  /** …and in any case no later than this many hours before the start date begins. */
  paymentCutoffHoursBeforeStart: 2,
  /** An approval is refused if it would leave the renter less time than this to pay. */
  minPaymentWindowMinutes: 60,

  /** 15% of the rental fee, charged to the owner side only. */
  commissionBps: 1500,

  depositMinPaise: 50_000,
  /** Owners may not set the deposit above the declared retail value. */
  rentalFeeMinPaise: 20_000,

  turnaroundDaysDefault: 1,
  turnaroundDaysMax: 7,

  /** Renter cancellations after payment: share of the rental fee refunded, by notice before start. */
  renterCancellationTiers: [
    { minHoursBeforeStart: 168, feeRefundBps: 10_000 },
    { minHoursBeforeStart: 48, feeRefundBps: 5_000 },
    { minHoursBeforeStart: 0, feeRefundBps: 0 },
  ],

  /** Late fee per day = rental fee ÷ rental days × 3/2, rounded up to the paisa. */
  lateFeeNumerator: 3,
  lateFeeDenominator: 2,

  inspectionWindowHours: 48,
  /** A rental this many days overdue opens a NOT_RETURNED dispute automatically. */
  autoDisputeOverdueDays: 3,
  reviewWindowDays: 14,
  minConditionPhotos: 3,
  maxListingPhotos: 8,
  maxUploadBytes: 8 * 1024 * 1024,
} as const;

export type MarketplacePolicy = typeof marketplacePolicy;
