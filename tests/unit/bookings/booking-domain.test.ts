import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  approvalDeadline,
  assertBookableStart,
  assertPaymentWindowUsable,
  bookingReference,
  currentPolicySnapshot,
  holdRange,
  lateReturn,
  paymentDeadline,
  priceBooking,
  renterCancellationRetainedFee,
  rentalDates,
} from "@/modules/bookings/domain/booking-rules";
import {
  BOOKING_STATUSES,
  type BookingActorRole,
  type BookingCommand,
  HOLDING_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  allowedPairs,
  resolveTransition,
} from "@/modules/bookings/domain/booking-state-machine";
import { settle } from "@/modules/deposits/domain/settlement";
import { localDate } from "@/shared/domain/local-date";

const policy = currentPolicySnapshot();
const COMMANDS = [...new Set(TRANSITIONS.map((t) => t.command))] as BookingCommand[];
const ROLES: BookingActorRole[] = ["RENTER", "OWNER", "ADMIN", "SYSTEM"];

describe("booking state machine", () => {
  it("allows exactly the transitions in the table, for exactly the listed actors (exhaustive)", () => {
    for (const from of BOOKING_STATUSES) {
      for (const command of COMMANDS) {
        for (const role of ROLES) {
          const expected = TRANSITIONS.filter(
            (t) => t.from === from && t.command === command && t.actors.includes(role),
          );
          if (expected.length === 0) {
            expect(() => resolveTransition(from, command, role), `${from} ${command} ${role}`).toThrow();
          } else {
            for (const t of expected) expect(resolveTransition(from, command, role, t.to)).toBe(t.to);
          }
        }
      }
    }
  });

  it("has no exits from terminal states", () => {
    for (const t of TRANSITIONS) expect(TERMINAL_STATUSES).not.toContain(t.from);
  });

  it("only lets the payment pipeline confirm a booking", () => {
    expect(resolveTransition("AWAITING_PAYMENT", "confirmPayment", "SYSTEM")).toBe("CONFIRMED");
    for (const role of ["RENTER", "OWNER", "ADMIN"] as const) {
      expect(() => resolveTransition("AWAITING_PAYMENT", "confirmPayment", role)).toThrow();
    }
  });

  it("holds the calendar from approval until a terminal release", () => {
    expect(HOLDING_STATUSES).not.toContain("PENDING_APPROVAL");
    expect(HOLDING_STATUSES).toContain("AWAITING_PAYMENT");
    expect(HOLDING_STATUSES).not.toContain("CANCELLED");
    expect(HOLDING_STATUSES).not.toContain("EXPIRED");
  });

  it("matches the 16 status pairs seeded in the database", () => {
    expect(allowedPairs()).toHaveLength(16);
  });
});

describe("dates and deadlines", () => {
  const now = new Date("2026-12-01T06:30:00Z"); // 12:00 IST, 1 Dec

  it("requires a start at least two days ahead in IST, and at most 180", () => {
    expect(() => assertBookableStart(localDate("2026-12-02"), now)).toThrow(/at least 2 days/);
    expect(() => assertBookableStart(localDate("2026-12-03"), now)).not.toThrow();
    expect(() => assertBookableStart(localDate("2027-06-30"), now)).toThrow(/180/);
    // 23:45 IST on 1 Dec is still 1 Dec in India even though it is 18:15 UTC.
    expect(() =>
      assertBookableStart(localDate("2026-12-03"), new Date("2026-12-01T18:15:00Z")),
    ).not.toThrow();
    // 00:15 IST on 2 Dec is the next day in India.
    expect(() => assertBookableStart(localDate("2026-12-03"), new Date("2026-12-01T18:45:00Z"))).toThrow();
  });

  it("computes a half-open hold covering the rental and the cleaning buffer", () => {
    const dates = rentalDates(localDate("2026-12-10"), 3);
    expect(dates.endDate).toBe("2026-12-12");
    expect(holdRange(dates, 1)).toEqual({ startsOn: "2026-12-10", endsBefore: "2026-12-14" });
    expect(holdRange(dates, 0)).toEqual({ startsOn: "2026-12-10", endsBefore: "2026-12-13" });
  });

  it("caps the approval and payment windows before the start date", () => {
    expect(approvalDeadline(now, localDate("2026-12-20"), policy).toISOString()).toBe(
      "2026-12-02T06:30:00.000Z",
    );
    // Start 3 Dec: 00:00 IST is 2 Dec 18:30 UTC; minus 12 h = 06:30 UTC on 2 Dec.
    expect(approvalDeadline(now, localDate("2026-12-03"), policy).toISOString()).toBe(
      "2026-12-02T06:30:00.000Z",
    );
    // Payment: 12 h after approval, but no later than 2 h before 00:00 IST on the start date.
    expect(paymentDeadline(now, localDate("2026-12-02"), policy).toISOString()).toBe(
      "2026-12-01T16:30:00.000Z",
    );
    const late = new Date("2026-12-01T16:00:00Z");
    expect(() =>
      assertPaymentWindowUsable(paymentDeadline(late, localDate("2026-12-02"), policy), late, policy),
    ).toThrow();
  });
});

describe("pricing", () => {
  it("freezes integer amounts with the money identities the database enforces", () => {
    const p = priceBooking(450_000, 800_000, 3, policy);
    expect(p).toEqual({
      rentalFeePaise: 450_000,
      depositPaise: 800_000,
      commissionRateBps: 1500,
      commissionPaise: 67_500,
      renterTotalPaise: 1_250_000,
      ownerPayoutPaise: 382_500,
      lateFeePerDayPaise: 225_000,
    });
  });

  it("always satisfies renter total = fee + deposit and payout = fee − commission", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20_000, max: 50_000_000 }),
        fc.integer({ min: 50_000, max: 50_000_000 }),
        fc.constantFrom(2, 3, 5, 7),
        (fee, deposit, days) => {
          const p = priceBooking(fee, deposit, days, policy);
          expect(p.renterTotalPaise).toBe(fee + deposit);
          expect(p.ownerPayoutPaise + p.commissionPaise).toBe(fee);
          expect(Number.isInteger(p.lateFeePerDayPaise)).toBe(true);
        },
      ),
    );
  });
});

describe("renter cancellation tiers", () => {
  const start = localDate("2026-12-20"); // begins 2026-12-19T18:30:00Z
  const fee = 450_000;
  const at = (iso: string) => renterCancellationRetainedFee(fee, start, new Date(iso), policy);

  it("refunds the full fee at 7 days or more", () => {
    expect(at("2026-12-12T18:30:00Z")).toBe(0); // exactly 168 h
  });
  it("keeps half between 48 hours and 7 days", () => {
    expect(at("2026-12-12T18:30:01Z")).toBe(225_000);
    expect(at("2026-12-17T18:30:00Z")).toBe(225_000); // exactly 48 h
  });
  it("keeps the whole fee within 48 hours", () => {
    expect(at("2026-12-17T18:30:01Z")).toBe(fee);
    expect(at("2026-12-21T10:00:00Z")).toBe(fee);
  });
});

describe("late return", () => {
  it("charges per late day and never more than the deposit", () => {
    expect(lateReturn(localDate("2026-12-12"), localDate("2026-12-12"), 225_000, 800_000)).toEqual({
      lateDays: 0,
      lateFeePaise: 0,
    });
    expect(lateReturn(localDate("2026-12-12"), localDate("2026-12-14"), 225_000, 800_000)).toEqual({
      lateDays: 2,
      lateFeePaise: 450_000,
    });
    expect(lateReturn(localDate("2026-12-12"), localDate("2026-12-20"), 225_000, 800_000)).toEqual({
      lateDays: 8,
      lateFeePaise: 800_000,
    });
  });
});

describe("settlement", () => {
  it("conserves money for any retained fee and withheld deposit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20_000, max: 50_000_000 }),
        fc.integer({ min: 50_000, max: 50_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (fee, deposit, bps, retainedShare, lateShare, damageShare) => {
          const retained = Math.floor(fee * retainedShare);
          const late = Math.floor(deposit * lateShare);
          const damage = Math.floor((deposit - late) * damageShare);
          const s = settle({
            rentalFeePaise: fee,
            depositPaise: deposit,
            commissionRateBps: bps,
            retainedFeePaise: retained,
            lateFeePaise: late,
            damagePaise: damage,
          });
          const payoutNet = s.payout?.netPaise ?? 0;
          expect(s.refund.totalPaise + payoutNet + s.commissionPaise).toBe(fee + deposit);
          expect(s.refund.rentalFeePortionPaise + s.refund.depositPortionPaise).toBe(s.refund.totalPaise);
          expect(s.deposit.withheldPaise).toBe(late + damage);
          if (s.payout) expect(s.payout.netPaise).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("classifies the deposit outcome", () => {
    const base = {
      rentalFeePaise: 450_000,
      depositPaise: 800_000,
      commissionRateBps: 1500,
      retainedFeePaise: 450_000,
    };
    expect(settle({ ...base, lateFeePaise: 0, damagePaise: 0 }).deposit.status).toBe("RELEASED");
    expect(settle({ ...base, lateFeePaise: 225_000, damagePaise: 0 }).deposit.status).toBe(
      "PARTIALLY_WITHHELD",
    );
    expect(settle({ ...base, lateFeePaise: 300_000, damagePaise: 500_000 }).deposit.status).toBe("FORFEITED");
  });

  it("keeps a zero-net payout row so a 100% commission still reconciles (found by the property test)", () => {
    const s = settle({
      rentalFeePaise: 100_000,
      depositPaise: 50_000,
      commissionRateBps: 10_000,
      retainedFeePaise: 100_000,
      lateFeePaise: 0,
      damagePaise: 0,
    });
    expect(s.payout).toEqual({
      grossRentalPaise: 100_000,
      commissionPaise: 100_000,
      depositWithheldPaise: 0,
      netPaise: 0,
    });
    expect(s.refund.totalPaise + s.payout!.netPaise + s.commissionPaise).toBe(150_000);
  });

  it("creates no payout when the owner keeps nothing", () => {
    const s = settle({
      rentalFeePaise: 450_000,
      depositPaise: 800_000,
      commissionRateBps: 1500,
      retainedFeePaise: 0,
      lateFeePaise: 0,
      damagePaise: 0,
    });
    expect(s.payout).toBeNull();
    expect(s.refund.totalPaise).toBe(1_250_000);
  });

  it("refuses impossible inputs", () => {
    const base = {
      rentalFeePaise: 100_000,
      depositPaise: 100_000,
      commissionRateBps: 1500,
      lateFeePaise: 0,
      damagePaise: 0,
    };
    expect(() => settle({ ...base, retainedFeePaise: 100_001 })).toThrow();
    expect(() => settle({ ...base, retainedFeePaise: 0, damagePaise: 100_001 })).toThrow();
  });
});

describe("references", () => {
  it("match the database format", () => {
    for (let i = 0; i < 50; i++) expect(bookingReference()).toMatch(/^PT-[0-9A-Z]{6}$/);
  });
});
