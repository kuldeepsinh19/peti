import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBookingApp,
  holdInvariantViolations,
  photos,
  reconciliation,
  scenario,
} from "../support/booking-app";
import { actorFor } from "../support/app";
import { createUser, db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

describe("no double booking under concurrency (ADR-004)", () => {
  it("of ten overlapping requests approved at the same moment, exactly one wins", async () => {
    const app = buildBookingApp();
    const { outfit, owner } = await scenario();
    const renters = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createUser({ name: `Renter ${i}` })),
    );
    const bookingIds: string[] = [];
    for (const [i, r] of renters.entries()) {
      // Overlapping windows: 10–12, 11–13, 12–14 … all collide with each other through the buffer.
      const day = String(10 + (i % 3)).padStart(2, "0");
      const { bookingId } = await app.bookings.request(actorFor(r), {
        outfitId: outfit.id,
        startDate: `2026-12-${day}`,
        days: 3,
        acceptTerms: "on",
      });
      bookingIds.push(bookingId);
    }
    const results = await Promise.allSettled(
      bookingIds.map((bookingId) => app.bookings.approve(owner, { bookingId })),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    for (const l of lost) expect(l.reason).toMatchObject({ code: "DATES_UNAVAILABLE" });
    expect(await db.calendarHold.count()).toBe(1);
    expect(await db.booking.count({ where: { status: "AWAITING_PAYMENT" } })).toBe(1);
    expect(await db.bookingStatusHistory.count({ where: { toStatus: "AWAITING_PAYMENT" } })).toBe(1);
    expect(await holdInvariantViolations()).toEqual([]);
  });

  it("an owner's block and an approval racing for the same dates: exactly one wins", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    const block = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM outfits WHERE id = ${outfit.id}::uuid FOR NO KEY UPDATE`;
      return tx.calendarHold.create({
        data: {
          outfitId: outfit.id,
          kind: "OWNER_BLOCK",
          startsOn: new Date("2026-12-11T00:00:00Z"),
          endsBefore: new Date("2026-12-13T00:00:00Z"),
          createdById: outfit.ownerId,
        },
      });
    });
    const results = await Promise.allSettled([block, app.bookings.approve(owner, { bookingId })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.calendarHold.count()).toBe(1);
    expect(await holdInvariantViolations()).toEqual([]);
  });

  it("confirming a booking closes other pending requests for overlapping dates", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const other = actorFor(await createUser({ name: "Other renter" }));
    const { bookingId } = await app.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    const { bookingId: competing } = await app.bookings.request(other, {
      outfitId: outfit.id,
      startDate: "2026-12-11",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(owner, { bookingId });
    expect((await db.booking.findUniqueOrThrow({ where: { id: competing } })).status).toBe(
      "PENDING_APPROVAL",
    ); // kept as a backup
    await app.payThroughSandbox(renter, bookingId);
    expect(await db.booking.findUniqueOrThrow({ where: { id: competing } })).toMatchObject({
      status: "REJECTED",
      closedReason: "DATES_UNAVAILABLE",
    });
  });
});

describe("payment confirmation is idempotent", () => {
  it("callback and webhook arriving together confirm exactly once (×10)", async () => {
    for (let round = 0; round < 10; round++) {
      await resetDatabase();
      const app = buildBookingApp();
      const { outfit, owner, renter } = await scenario();
      const { bookingId } = await app.bookings.request(renter, {
        outfitId: outfit.id,
        startDate: "2026-12-10",
        days: 3,
        acceptTerms: "on",
      });
      await app.bookings.approve(owner, { bookingId });
      const session = await app.payments.startCheckout(renter, bookingId);
      const orderId = (session as { url: string }).url.split("/").pop()!;
      const sim = await app.sandbox.simulate(orderId, "pay");
      const [webhook, callback] = await Promise.all([
        app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers),
        app.payments.handleCallback(sim.callback!),
      ]);
      expect(webhook.status).toBe(200);
      expect(["CONFIRMED", "ALREADY_CONFIRMED"]).toContain(callback.outcome);
      expect(await db.bookingStatusHistory.count({ where: { bookingId, toStatus: "CONFIRMED" } })).toBe(1);
      expect(await db.securityDeposit.count({ where: { bookingId } })).toBe(1);
    }
  });

  it("processes a duplicate webhook once and rejects tampered or unsigned ones", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(owner, { bookingId });

    const paid = await app.payThroughSandbox(renter, bookingId, "pay-duplicate-webhook");
    expect(paid.webhookResults).toEqual([
      { status: 200, body: "ok" },
      { status: 200, body: "duplicate" },
    ]);
    expect(await db.providerEvent.count()).toBe(1);

    const w = paid.sim.webhooks[0]!;
    const tampered = w.body.replace(/"amountPaise":\d+/, '"amountPaise":1');
    expect(await app.payments.handleWebhook(tampered, w.headers)).toEqual({
      status: 401,
      body: "BAD_SIGNATURE",
    });
    expect(
      await app.payments.handleWebhook(w.body, { ...w.headers, "x-sandbox-signature": undefined }),
    ).toEqual({ status: 401, body: "BAD_SIGNATURE" });
    expect(await db.providerEvent.count()).toBe(1); // nothing stored for bad signatures
  });

  it("never confirms on a forged callback", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(owner, { bookingId });
    const session = await app.payments.startCheckout(renter, bookingId);
    const orderId = (session as { url: string }).url.split("/").pop()!;
    const forged = {
      provider_order_id: orderId,
      provider_payment_id: "pay_sb_forged",
      signature: "0".repeat(64),
    };
    expect(await app.payments.handleCallback(forged)).toEqual({ bookingId: null, outcome: "INVALID" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      "AWAITING_PAYMENT",
    );
  });

  it("a failed payment leaves the booking awaiting payment and records the failure", async () => {
    const app = buildBookingApp();
    const { outfit, owner, renter } = await scenario();
    const { bookingId } = await app.bookings.request(renter, {
      outfitId: outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(owner, { bookingId });
    await app.payThroughSandbox(renter, bookingId, "fail");
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payment: true } });
    expect(b.status).toBe("AWAITING_PAYMENT");
    expect(b.payment).toMatchObject({ status: "CREATED", lastFailureCode: "SANDBOX_DECLINED" });
  });
});

describe("disputes", () => {
  async function returnedBooking() {
    const app = buildBookingApp();
    const s = await scenario();
    const { bookingId } = await app.bookings.request(s.renter, {
      outfitId: s.outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(s.owner, { bookingId });
    await app.payThroughSandbox(s.renter, bookingId);
    app.clock.set("2026-12-10T05:00:00Z");
    await app.bookings.submitHandoverReport(
      s.owner,
      { bookingId, grade: "EXCELLENT", notes: "Perfect." },
      photos(3),
    );
    await app.bookings.acknowledgeHandover(s.renter, { bookingId });
    app.clock.set("2026-12-12T12:00:00Z");
    await app.bookings.recordReturn(s.owner, { bookingId, grade: "GOOD", notes: "Torn hem." }, photos(3));
    return { app, ...s, bookingId };
  }

  it("a damage claim the renter accepts is settled from the deposit", async () => {
    const { app, owner, renter, bookingId } = await returnedBooking();
    await expect(
      app.bookings.openDispute(owner, {
        bookingId,
        kind: "DAMAGE",
        description: "The hem is torn along twenty centimetres.",
        claimedRupees: "9000",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" }); // above the deposit
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: "2000",
    });
    // Auto-completion must not happen while the dispute is open.
    app.clock.advance(72 * 3_600_000);
    expect((await app.bookings.sweep()).autoCompleted).toBe(0);
    await expect(app.bookings.acceptClaim(owner, { bookingId })).rejects.toMatchObject({
      code: "NOT_RESPONDENT",
    });
    await app.bookings.acceptClaim(renter, { bookingId });
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { deposit: true, payout: true, disputes: true },
    });
    expect(b.status).toBe("COMPLETED");
    expect(b.deposit).toMatchObject({ status: "PARTIALLY_WITHHELD", damagePaise: 200_000 });
    expect(b.payout?.netPaise).toBe(382_500 + 200_000);
    expect(b.disputes[0]).toMatchObject({ status: "RESOLVED", resolution: "RESPONDENT_ACCEPTED" });
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });

  it("an administrator decides a contested claim, with an audit entry", async () => {
    const { app, owner, admin, bookingId } = await returnedBooking();
    await app.bookings.openDispute(owner, {
      bookingId,
      kind: "DAMAGE",
      description: "The hem is torn along twenty centimetres.",
      claimedRupees: "5000",
    });
    await expect(
      app.bookings.resolveDispute(owner, {
        bookingId,
        outcome: "COMPLETE",
        depositWithheldRupees: "0",
        retainedFeeRupees: "4500",
        notes: "Owner deciding",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await app.bookings.resolveDispute(admin, {
      bookingId,
      outcome: "COMPLETE",
      depositWithheldRupees: "1500",
      retainedFeeRupees: "4500",
      notes: "Photos show a small tear; repair cost estimated at ₹1,500.",
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { deposit: true } });
    expect(b.status).toBe("COMPLETED");
    expect(b.deposit).toMatchObject({ withheldPaise: 150_000, settlementBasis: "ADMIN_DECISION" });
    expect(
      await db.auditLog.count({ where: { entityId: bookingId, action: "booking.resolveDispute" } }),
    ).toBe(1);
    expect(await reconciliation(bookingId)).toMatchObject({ imbalance_paise: 0 });
  });

  it("opens a not-returned dispute automatically when a rental is more than three days overdue", async () => {
    const app = buildBookingApp();
    const s = await scenario();
    const { bookingId } = await app.bookings.request(s.renter, {
      outfitId: s.outfit.id,
      startDate: "2026-12-10",
      days: 3,
      acceptTerms: "on",
    });
    await app.bookings.approve(s.owner, { bookingId });
    await app.payThroughSandbox(s.renter, bookingId);
    app.clock.set("2026-12-10T05:00:00Z");
    await app.bookings.submitHandoverReport(
      s.owner,
      { bookingId, grade: "EXCELLENT", notes: "Perfect." },
      photos(3),
    );
    await app.bookings.acknowledgeHandover(s.renter, { bookingId });
    app.clock.set("2026-12-15T06:30:00Z"); // 3 days after the 12th: not yet
    expect((await app.bookings.sweep()).autoDisputed).toBe(0);
    app.clock.set("2026-12-16T06:30:00Z");
    expect((await app.bookings.sweep()).autoDisputed).toBe(1);
    expect(await db.dispute.findFirstOrThrow({ where: { bookingId } })).toMatchObject({
      kind: "NOT_RETURNED",
      openedByRole: "SYSTEM",
    });
  });
});
