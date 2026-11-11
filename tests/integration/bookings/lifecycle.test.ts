import { beforeEach, describe, expect, it } from "vitest";
import { allowedPairs } from "@/modules/bookings";
import { HOUR_MS } from "@/shared/domain/clock";
import {
  buildBookingApp,
  holdInvariantViolations,
  photos,
  reconciliation,
  scenario,
} from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

const request = (outfitId: string, startDate = "2026-12-10", days = 3) => ({
  outfitId,
  startDate,
  days,
  acceptTerms: "on",
});

describe("happy path", () => {
  it("request → approve → pay → handover → return → complete, with conserved money", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();

    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    const requested = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(requested).toMatchObject({
      status: "PENDING_APPROVAL",
      rentalFeePaise: 450_000,
      depositPaise: 800_000,
      renterTotalPaise: 1_250_000,
      commissionPaise: 67_500,
    });
    expect(await db.calendarHold.count()).toBe(0); // requests hold nothing

    await app.bookings.approve(owner, { bookingId });
    const hold = await db.calendarHold.findFirstOrThrow({ where: { bookingId } });
    expect(hold.startsOn.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(hold.endsBefore.toISOString().slice(0, 10)).toBe("2026-12-14"); // 3 days + 1 cleaning day

    const paid = await app.payThroughSandbox(renter, bookingId);
    expect(paid.callback?.outcome).toBe("ALREADY_CONFIRMED"); // the webhook got there first
    expect(paid.webhookResults[0]).toEqual({ status: 200, body: "ok" });
    const confirmed = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { deposit: true, payment: true },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.deposit).toMatchObject({ status: "HELD", amountPaise: 800_000 });
    expect(confirmed.payment).toMatchObject({ status: "CAPTURED", amountPaise: 1_250_000 });

    // Owner cannot record the handover too early; renter cannot acknowledge without a report.
    await expect(
      app.bookings.submitHandoverReport(
        owner,
        { bookingId, grade: "EXCELLENT", notes: "Pressed, no marks." },
        photos(3),
      ),
    ).rejects.toMatchObject({ code: "TOO_EARLY" });
    app.clock.set("2026-12-09T05:00:00Z");
    await expect(app.bookings.acknowledgeHandover(renter, { bookingId })).rejects.toMatchObject({
      code: "NO_HANDOVER_REPORT",
    });
    await expect(
      app.bookings.submitHandoverReport(
        owner,
        { bookingId, grade: "EXCELLENT", notes: "Pressed." },
        photos(2),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await app.bookings.submitHandoverReport(
      owner,
      { bookingId, grade: "EXCELLENT", notes: "Pressed, no marks." },
      photos(3),
    );
    await app.bookings.acknowledgeHandover(renter, { bookingId, notes: "Looks perfect." });

    app.clock.set("2026-12-12T12:00:00Z");
    const late = await app.bookings.recordReturn(
      owner,
      { bookingId, grade: "EXCELLENT", notes: "Returned clean." },
      photos(3),
    );
    expect(late).toEqual({ lateDays: 0, lateFeePaise: 0 });
    await app.bookings.confirmReturn(owner, { bookingId });

    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { deposit: true, payout: true, refunds: true },
    });
    expect(b.status).toBe("COMPLETED");
    expect(b.deposit).toMatchObject({ status: "RELEASED", withheldPaise: 0 });
    expect(b.refunds).toMatchObject([
      { reason: "DEPOSIT_RELEASE", amountPaise: 800_000, depositPortionPaise: 800_000, status: "PENDING" },
    ]);
    expect(b.payout).toMatchObject({
      grossRentalPaise: 450_000,
      commissionPaise: 67_500,
      netPaise: 382_500,
      status: "PENDING",
    });
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0, captured_paise: 1_250_000 });

    const history = await db.bookingStatusHistory.findMany({ where: { bookingId }, orderBy: { id: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual([
      "PENDING_APPROVAL",
      "AWAITING_PAYMENT",
      "CONFIRMED",
      "ACTIVE",
      "RETURNED",
      "COMPLETED",
    ]);
    expect(await holdInvariantViolations()).toEqual([]);

    // The refund outbox is dispatched to the provider after commit, exactly once.
    expect(await app.payments.dispatchRefunds()).toEqual({ claimed: 1, sent: 1 });
    expect(await app.payments.dispatchRefunds()).toEqual({ claimed: 0, sent: 0 });
    expect(await db.refund.findFirstOrThrow({ where: { bookingId } })).toMatchObject({ status: "PROCESSED" });

    // Notifications were queued for both parties along the way.
    expect(
      await db.notification.count({ where: { userId: renter.userId, channel: "IN_APP" } }),
    ).toBeGreaterThanOrEqual(4);
  });

  it("charges a late fee from the deposit and settles it to the owner", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    await app.bookings.approve(owner, { bookingId });
    await app.payThroughSandbox(renter, bookingId);
    app.clock.set("2026-12-10T05:00:00Z");
    await app.bookings.submitHandoverReport(owner, { bookingId, grade: "GOOD", notes: "Fine." }, photos(3));
    await app.bookings.acknowledgeHandover(renter, { bookingId });
    app.clock.set("2026-12-14T05:00:00Z");
    const late = await app.bookings.recordReturn(
      owner,
      { bookingId, grade: "GOOD", notes: "Two days late.", returnedOn: "2026-12-14" },
      photos(3),
    );
    expect(late).toEqual({ lateDays: 2, lateFeePaise: 450_000 });
    // Nobody acts: the sweep completes the booking when the 48-hour inspection window closes.
    app.clock.advance(49 * HOUR_MS);
    expect((await app.bookings.sweep()).autoCompleted).toBe(1);
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { deposit: true, payout: true },
    });
    expect(b.status).toBe("COMPLETED");
    expect(b.deposit).toMatchObject({
      status: "PARTIALLY_WITHHELD",
      lateFeePaise: 450_000,
      settlementBasis: "AUTO_NO_CLAIM",
    });
    expect(b.payout).toMatchObject({ depositWithheldPaise: 450_000, netPaise: 382_500 + 450_000 });
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });
});

describe("rules and permissions", () => {
  it("refuses self-rental, unverified renters, unknown durations and strangers", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter, admin } = await scenario();
    await expect(app.bookings.request(owner, request(outfit.id))).rejects.toMatchObject({
      code: "OWN_OUTFIT",
    });
    await expect(
      app.bookings.request({ ...renter, phoneVerified: false }, request(outfit.id)),
    ).rejects.toMatchObject({ code: "PHONE_NOT_VERIFIED" });
    await expect(app.bookings.request(renter, request(outfit.id, "2026-12-10", 5))).rejects.toMatchObject({
      code: "DURATION_NOT_OFFERED",
    });
    await expect(app.bookings.request(renter, request(outfit.id, "2026-12-02"))).rejects.toMatchObject({
      code: "START_TOO_SOON",
    });

    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    await expect(app.bookings.approve(renter, { bookingId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.bookings.approve(admin, { bookingId })).rejects.toBeDefined();
    const stranger = {
      ...renter,
      userId: owner.userId === renter.userId ? "x" : admin.userId,
      isAdmin: false,
    };
    await expect(app.bookings.detail(stranger, bookingId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.payments.startCheckout(renter, bookingId)).rejects.toMatchObject({
      code: "NOT_PAYABLE",
    });
  });

  it("hides contact details until the booking is paid", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    await app.bookings.approve(owner, { bookingId });
    expect((await app.bookings.detail(renter, bookingId)).owner.phone).toBeNull();
    expect((await app.bookings.detail(owner, bookingId)).renter.phone).toBeNull();
    await app.payThroughSandbox(renter, bookingId);
    expect((await app.bookings.detail(renter, bookingId)).owner.phone).toMatch(/^\+91/);
  });

  it("keeps the TypeScript transition table identical to the database's", async () => {
    const rows = await db.bookingAllowedTransition.findMany();
    const sql = rows.map((r) => `${r.fromStatus}->${r.toStatus}`).sort();
    const ts = allowedPairs()
      .map(([f, t]) => `${f}->${t}`)
      .sort();
    expect(sql).toEqual(ts);
  });
});

describe("cancellation", () => {
  async function paidBooking() {
    const app = buildBookingApp();
    const s = await scenario();
    const { bookingId } = await app.bookings.request(s.renter, request(s.outfit.id, "2026-12-20"));
    await app.bookings.approve(s.owner, { bookingId });
    await app.payThroughSandbox(s.renter, bookingId);
    return { app, ...s, bookingId };
  }

  it("renter cancelling 7+ days ahead gets everything back", async () => {
    const { app, renter, bookingId } = await paidBooking();
    await app.bookings.cancel(renter, { bookingId });
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { refunds: true, payout: true, deposit: true },
    });
    expect(b).toMatchObject({ status: "CANCELLED", closedReason: "RENTER_CANCELLED" });
    expect(b.refunds[0]).toMatchObject({
      amountPaise: 1_250_000,
      rentalFeePortionPaise: 450_000,
      depositPortionPaise: 800_000,
    });
    expect(b.payout).toBeNull();
    expect(b.deposit?.status).toBe("RELEASED");
    expect(await db.calendarHold.count({ where: { bookingId } })).toBe(0);
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });

  it("renter cancelling within 48 hours forfeits the fee but not the deposit", async () => {
    const { app, renter, bookingId } = await paidBooking();
    app.clock.set("2026-12-18T20:00:00Z"); // under 48 h before 00:00 IST on 20 Dec
    await app.bookings.cancel(renter, { bookingId });
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { refunds: true, payout: true },
    });
    expect(b.refunds[0]).toMatchObject({ amountPaise: 800_000, rentalFeePortionPaise: 0 });
    expect(b.payout).toMatchObject({ grossRentalPaise: 450_000, netPaise: 382_500 });
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });

  it("owner cancelling refunds everything and is counted against the owner", async () => {
    const { app, owner, bookingId } = await paidBooking();
    await app.bookings.cancel(owner, { bookingId });
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { refunds: true, payout: true },
    });
    expect(b.closedReason).toBe("OWNER_CANCELLED");
    expect(b.refunds[0]?.amountPaise).toBe(1_250_000);
    expect(b.payout).toBeNull();
    expect(
      (await db.userProfile.findUniqueOrThrow({ where: { userId: owner.userId } })).ownerCancellationCount,
    ).toBe(1);
  });
});

describe("deadlines", () => {
  it("expires unanswered requests and unpaid approvals, releasing the dates", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId: first } = await app.bookings.request(renter, request(outfit.id));
    app.clock.advance(25 * HOUR_MS);
    expect((await app.bookings.sweep()).expiredApprovals).toBe(1);
    expect(await db.booking.findUniqueOrThrow({ where: { id: first } })).toMatchObject({
      status: "EXPIRED",
      closedReason: "APPROVAL_TIMEOUT",
    });

    const { bookingId: second } = await app.bookings.request(renter, request(outfit.id, "2026-12-12"));
    await app.bookings.approve(owner, { bookingId: second });
    await app.payments.startCheckout(renter, second); // creates the order, but the renter never pays
    app.clock.advance(13 * HOUR_MS);
    expect((await app.bookings.sweep()).expiredPayments).toBe(1);
    const b = await db.booking.findUniqueOrThrow({ where: { id: second }, include: { payment: true } });
    expect(b).toMatchObject({ status: "EXPIRED", closedReason: "PAYMENT_TIMEOUT" });
    expect(b.payment?.status).toBe("ABANDONED");
    expect(await db.calendarHold.count()).toBe(0);
  });

  it("confirms instead of expiring when the provider says the order was paid (reconciliation)", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    await app.bookings.approve(owner, { bookingId });
    const session = await app.payments.startCheckout(renter, bookingId);
    const orderId = (session as { url: string }).url.split("/").pop()!;
    await app.sandbox.simulate(orderId, "pay"); // paid at the provider; neither signal reaches us
    app.clock.advance(13 * HOUR_MS);
    const report = await app.bookings.sweep();
    expect(report.expiredPayments).toBe(0);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CONFIRMED");
  });

  it("refunds a capture that arrives after expiry, without reviving the booking", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, request(outfit.id));
    await app.bookings.approve(owner, { bookingId });
    const session = await app.payments.startCheckout(renter, bookingId);
    const orderId = (session as { url: string }).url.split("/").pop()!;
    app.clock.advance(13 * HOUR_MS);
    await app.bookings.sweep(); // provider has no payment yet → expires
    const sim = await app.sandbox.simulate(orderId, "pay-webhook-only");
    expect(await app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers)).toEqual({
      status: 200,
      body: "ok",
    });
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { refunds: true, payment: true },
    });
    expect(b.status).toBe("EXPIRED");
    expect(b.payment?.status).toBe("CAPTURED");
    expect(b.refunds).toMatchObject([{ reason: "LATE_CAPTURE_REVERSAL", amountPaise: 1_250_000 }]);
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });
});
