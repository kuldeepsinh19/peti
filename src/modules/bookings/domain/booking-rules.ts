import { marketplacePolicy } from "@/config/marketplace-policy";
import { HOUR_MS, MINUTE_MS } from "@/shared/domain/clock";
import { PreconditionError } from "@/shared/domain/errors";
import {
  type LocalDate,
  addDays,
  daysBetween,
  localDateInIndia,
  startOfDayInIndia,
} from "@/shared/domain/local-date";
import {
  type Paise,
  applyBasisPoints,
  basisPoints,
  mulDivCeil,
  paise,
  subtractPaise,
} from "@/shared/domain/money";

/**
 * The subset of marketplace policy that is frozen onto each booking when it is requested. Later policy
 * changes never alter an existing agreement.
 */
export interface PolicySnapshot {
  version: string;
  commissionBps: number;
  approvalWindowHours: number;
  approvalCutoffHoursBeforeStart: number;
  paymentWindowHours: number;
  paymentCutoffHoursBeforeStart: number;
  minPaymentWindowMinutes: number;
  renterCancellationTiers: ReadonlyArray<{ minHoursBeforeStart: number; feeRefundBps: number }>;
  lateFeeNumerator: number;
  lateFeeDenominator: number;
  inspectionWindowHours: number;
  autoDisputeOverdueDays: number;
  minConditionPhotos: number;
}

export function currentPolicySnapshot(): PolicySnapshot {
  const p = marketplacePolicy;
  return {
    version: p.version,
    commissionBps: p.commissionBps,
    approvalWindowHours: p.approvalWindowHours,
    approvalCutoffHoursBeforeStart: p.approvalCutoffHoursBeforeStart,
    paymentWindowHours: p.paymentWindowHours,
    paymentCutoffHoursBeforeStart: p.paymentCutoffHoursBeforeStart,
    minPaymentWindowMinutes: p.minPaymentWindowMinutes,
    renterCancellationTiers: p.renterCancellationTiers,
    lateFeeNumerator: p.lateFeeNumerator,
    lateFeeDenominator: p.lateFeeDenominator,
    inspectionWindowHours: p.inspectionWindowHours,
    autoDisputeOverdueDays: p.autoDisputeOverdueDays,
    minConditionPhotos: p.minConditionPhotos,
  };
}

/** Parses a stored snapshot, filling any field it lacks from the current policy. */
export function readPolicySnapshot(value: unknown): PolicySnapshot {
  const current = currentPolicySnapshot();
  return value && typeof value === "object" ? { ...current, ...(value as Partial<PolicySnapshot>) } : current;
}

// ─── Dates ───────────────────────────────────────────────────────────────────────────────────────

export interface RentalDates {
  startDate: LocalDate;
  endDate: LocalDate;
  rentalDays: number;
}

export function rentalDates(startDate: LocalDate, rentalDays: number): RentalDates {
  return { startDate, endDate: addDays(startDate, rentalDays - 1), rentalDays };
}

/** The renter must request at least `minLeadDays` ahead (in IST) and no more than `maxAdvanceDays`. */
export function assertBookableStart(startDate: LocalDate, now: Date): void {
  const today = localDateInIndia(now);
  const lead = daysBetween(today, startDate);
  if (lead < marketplacePolicy.minLeadDays) {
    throw new PreconditionError(
      "START_TOO_SOON",
      `Choose a start date at least ${marketplacePolicy.minLeadDays} days from today, so there is time to approve and pay.`,
    );
  }
  if (lead > marketplacePolicy.maxAdvanceDays) {
    throw new PreconditionError(
      "START_TOO_FAR",
      `Bookings open up to ${marketplacePolicy.maxAdvanceDays} days ahead.`,
    );
  }
}

/** Half-open calendar hold: the rental days plus the owner's cleaning buffer. */
export function holdRange(
  dates: RentalDates,
  bufferDays: number,
): { startsOn: LocalDate; endsBefore: LocalDate } {
  return { startsOn: dates.startDate, endsBefore: addDays(dates.endDate, 1 + bufferDays) };
}

const earliest = (...instants: Date[]) => new Date(Math.min(...instants.map((d) => d.getTime())));

export function approvalDeadline(requestedAt: Date, startDate: LocalDate, policy: PolicySnapshot): Date {
  return earliest(
    new Date(requestedAt.getTime() + policy.approvalWindowHours * HOUR_MS),
    new Date(startOfDayInIndia(startDate).getTime() - policy.approvalCutoffHoursBeforeStart * HOUR_MS),
  );
}

export function paymentDeadline(approvedAt: Date, startDate: LocalDate, policy: PolicySnapshot): Date {
  return earliest(
    new Date(approvedAt.getTime() + policy.paymentWindowHours * HOUR_MS),
    new Date(startOfDayInIndia(startDate).getTime() - policy.paymentCutoffHoursBeforeStart * HOUR_MS),
  );
}

/** An approval that would leave the renter almost no time to pay is refused. */
export function assertPaymentWindowUsable(deadline: Date, now: Date, policy: PolicySnapshot): void {
  if (deadline.getTime() - now.getTime() < policy.minPaymentWindowMinutes * MINUTE_MS) {
    throw new PreconditionError(
      "TOO_LATE_TO_APPROVE",
      "It is too close to the start date for the renter to pay. Decline the request instead.",
    );
  }
}

// ─── Money ───────────────────────────────────────────────────────────────────────────────────────

export interface PricingSnapshot {
  rentalFeePaise: Paise;
  depositPaise: Paise;
  commissionRateBps: number;
  commissionPaise: Paise;
  renterTotalPaise: Paise;
  ownerPayoutPaise: Paise;
  lateFeePerDayPaise: Paise;
}

/** Frozen price breakdown for one booking. Integer paise throughout. */
export function priceBooking(
  rentalFeePaise: number,
  depositPaise: number,
  rentalDays: number,
  policy: PolicySnapshot,
): PricingSnapshot {
  const fee = paise(rentalFeePaise);
  const deposit = paise(depositPaise);
  const commission = applyBasisPoints(fee, basisPoints(policy.commissionBps));
  return {
    rentalFeePaise: fee,
    depositPaise: deposit,
    commissionRateBps: policy.commissionBps,
    commissionPaise: commission,
    renterTotalPaise: paise(fee + deposit),
    ownerPayoutPaise: subtractPaise(fee, commission),
    lateFeePerDayPaise: mulDivCeil(fee, policy.lateFeeNumerator, rentalDays * policy.lateFeeDenominator),
  };
}

/**
 * How much of the rental fee the owner keeps when the renter cancels after paying, by notice measured
 * from 00:00 IST on the start date. The deposit is always refunded in full on cancellation.
 */
export function renterCancellationRetainedFee(
  rentalFeePaise: number,
  startDate: LocalDate,
  now: Date,
  policy: PolicySnapshot,
): Paise {
  const hoursBefore = (startOfDayInIndia(startDate).getTime() - now.getTime()) / HOUR_MS;
  const tiers = [...policy.renterCancellationTiers].sort(
    (a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart,
  );
  const tier = tiers.find((t) => hoursBefore >= t.minHoursBeforeStart) ?? { feeRefundBps: 0 };
  const refunded = applyBasisPoints(paise(rentalFeePaise), basisPoints(tier.feeRefundBps));
  return subtractPaise(paise(rentalFeePaise), refunded);
}

/** Late days and fee for a return on `returnedOn`, capped at the deposit. */
export function lateReturn(
  endDate: LocalDate,
  returnedOn: LocalDate,
  lateFeePerDayPaise: number,
  depositPaise: number,
): { lateDays: number; lateFeePaise: Paise } {
  const lateDays = Math.max(0, daysBetween(endDate, returnedOn));
  return { lateDays, lateFeePaise: paise(Math.min(lateDays * lateFeePerDayPaise, depositPaise)) };
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Human-friendly booking reference, e.g. PT-7F3K2Q (no 0/O or 1/I to avoid misreading). */
export function bookingReference(random: () => number = Math.random): string {
  return `PT-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]).join("")}`;
}
