/**
 * Payment reliability (ADR-006, audit S-04 and S-06): explicit capture, reversal of stray captures, capture
 * retries, and refunds settled without their webhook. Sandbox provider and a real PostgreSQL database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PaymentProvider } from "@/modules/payments/domain/payment-provider";
import { PaymentProviderError } from "@/modules/payments/domain/payment-provider";
import { prismaAdminRepository } from "@/modules/admin/infrastructure/prisma-admin-repository";
import { prismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";
import { HOUR_MS, MINUTE_MS } from "@/shared/domain/clock";
import { buildBookingApp, reconciliation, scenario } from "../support/booking-app";
import { db, resetDatabase } from "../support/db";

beforeEach(async () => {
  await resetDatabase();
});

type App = ReturnType<typeof buildBookingApp>;

async function approvedBooking(app: App, startDate = "2026-12-10") {
  const s = await scenario();
  const { bookingId } = await app.bookings.request(s.renter, {
    outfitId: s.outfit.id,
    startDate,
    days: 3,
    acceptTerms: "on",
  });
  await app.bookings.approve(s.owner, { bookingId });
  return { ...s, bookingId };
}

async function orderFor(app: App, booking: Awaited<ReturnType<typeof approvedBooking>>) {
  const session = await app.payments.startCheckout(booking.renter, booking.bookingId);
  return (session as { url: string }).url.split("/").pop()!;
}

const sandboxStatus = async (paymentId: string) =>
  (
    (await db.sandboxProviderObject.findUniqueOrThrow({ where: { id: paymentId } })).data as {
      status: string;
    }
  ).status;

describe("explicit capture", () => {
  it("captures exactly one of two authorisations on an order, however the reports interleave", async () => {
    for (let i = 0; i < 3; i++) {
      const app = buildBookingApp();
      const booking = await approvedBooking(app);
      const orderId = await orderFor(app, booking);
      const sim = await app.sandbox.simulate(orderId, "pay-twice");

      // Both webhooks and the browser callback at once, as a double tap on a slow connection would do.
      await Promise.all([
        ...sim.webhooks.map((w) => app.payments.handleWebhook(w.body, w.headers)),
        app.payments.handleCallback(sim.callback!),
      ]);

      const statuses = await Promise.all(sim.paymentIds.map(sandboxStatus));
      expect([...statuses].sort()).toEqual(["authorized", "captured"]);
      const captured = sim.paymentIds[statuses.indexOf("captured")];
      const payment = await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } });
      expect(payment).toMatchObject({ status: "CAPTURED", refundedPaise: 0, providerPaymentId: captured });
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).status).toBe(
        "CONFIRMED",
      );
      expect(await db.refund.count({ where: { bookingId: booking.bookingId } })).toBe(0);
      await resetDatabase();
    }
  });

  it("never captures an authorisation for the wrong amount, and the renter can still pay", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const wrong = await app.sandbox.simulate(orderId, "pay-wrong-amount");
    await app.payments.handleWebhook(wrong.webhooks[0]!.body, wrong.webhooks[0]!.headers);
    expect((await app.payments.handleCallback(wrong.callback!)).outcome).toBe("DECLINED");

    expect(await sandboxStatus(wrong.paymentIds[0]!)).toBe("authorized");
    expect(await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } })).toMatchObject({
      status: "CREATED",
      providerPaymentId: null,
    });
    const declined = await db.auditLog.findFirstOrThrow({
      where: { action: "payment.authorizationDeclined" },
    });
    expect(declined.after).toMatchObject({ reason: "AMOUNT_MISMATCH" });

    const right = await app.sandbox.simulate(orderId, "pay");
    await app.payments.handleWebhook(right.webhooks[0]!.body, right.webhooks[0]!.headers);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).status).toBe(
      "CONFIRMED",
    );
  });

  it("retries a capture call that failed, and refuses a second checkout meanwhile", async () => {
    let failures = 1;
    const app = buildBookingApp(undefined, {
      wrapProvider: (p): PaymentProvider => ({
        ...p,
        async capturePayment(id, amount) {
          if (failures-- > 0) throw new PaymentProviderError("TRANSIENT", "Razorpay request failed");
          return p.capturePayment(id, amount);
        },
      }),
    });
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const sim = await app.sandbox.simulate(orderId, "pay");
    expect(await app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers)).toEqual({
      status: 200,
      body: "ok",
    });
    expect(await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } })).toMatchObject({
      status: "AUTHORIZED",
      providerPaymentId: sim.paymentIds[0],
      captureAttempts: 1,
      lastCaptureError: "Razorpay request failed",
    });
    await expect(app.payments.startCheckout(booking.renter, booking.bookingId)).rejects.toMatchObject({
      code: "PAYMENT_PROCESSING",
    });

    // Reconciliation (the expiry sweep runs it too) captures the claimed authorisation.
    await app.payments.reconcile(booking.bookingId);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).status).toBe(
      "CONFIRMED",
    );
    expect((await app.payments.handleCallback(sim.callback!)).outcome).toBe("ALREADY_CONFIRMED");
  });

  it("records a capture whose response was lost on the way back", async () => {
    let loseResponse = true;
    const app = buildBookingApp(undefined, {
      wrapProvider: (p): PaymentProvider => ({
        ...p,
        async capturePayment(id, amount) {
          const result = await p.capturePayment(id, amount);
          if (loseResponse) {
            loseResponse = false;
            throw new PaymentProviderError("TRANSIENT", "Razorpay request failed");
          }
          return result;
        },
      }),
    });
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const sim = await app.sandbox.simulate(orderId, "pay-callback-only");
    expect((await app.payments.handleCallback(sim.callback!)).outcome).toBe("CONFIRMED");
  });

  it("frees the booking for another payment when the claimed authorisation can no longer be captured", async () => {
    const app = buildBookingApp(undefined, {
      wrapProvider: (p): PaymentProvider => ({
        ...p,
        async capturePayment(id) {
          // As if the authorisation had already been returned to the payer.
          const row = await db.sandboxProviderObject.findUniqueOrThrow({ where: { id } });
          await db.sandboxProviderObject.update({
            where: { id },
            data: { data: { ...(row.data as object), status: "refunded" } },
          });
          throw new PaymentProviderError("REJECTED", "Razorpay request failed");
        },
      }),
    });
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const sim = await app.sandbox.simulate(orderId, "pay-webhook-only");
    await app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers);
    expect(await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } })).toMatchObject({
      status: "CREATED",
      providerPaymentId: null,
      captureAttempts: 1,
    });
    // The renter can start checkout again.
    await expect(app.payments.startCheckout(booking.renter, booking.bookingId)).resolves.toMatchObject({
      mode: "REDIRECT",
    });
  });
});

describe("an authorisation that is still being captured at the payment deadline", () => {
  /** The renter pays in time, but every capture call fails until `provider.up` is set. */
  async function authorisedButNotCaptured() {
    const provider = { up: false };
    const app = buildBookingApp(undefined, {
      wrapProvider: (p): PaymentProvider => ({
        ...p,
        async capturePayment(id, amount) {
          if (!provider.up) throw new PaymentProviderError("TRANSIENT", "Razorpay request failed");
          return p.capturePayment(id, amount);
        },
      }),
    });
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const sim = await app.sandbox.simulate(orderId, "pay-webhook-only");
    await app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers);
    return { app, booking, provider, paymentId: sim.paymentIds[0]! };
  }
  const status = async (bookingId: string) =>
    (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status;

  it("keeps the booking for an hour while the capture is retried, then confirms it", async () => {
    const { app, booking, provider } = await authorisedButNotCaptured();
    app.clock.advance(12 * HOUR_MS + 10 * MINUTE_MS); // past the 12-hour payment window
    expect((await app.bookings.sweep()).expiredPayments).toBe(0);
    expect(await status(booking.bookingId)).toBe("AWAITING_PAYMENT");

    provider.up = true;
    await app.bookings.sweep(); // the pre-expiry reconcile captures it
    expect(await status(booking.bookingId)).toBe("CONFIRMED");
  });

  it("expires the booking after the hour, and never captures the authorisation", async () => {
    const { app, booking, paymentId } = await authorisedButNotCaptured();
    app.clock.advance(13 * HOUR_MS + 10 * MINUTE_MS);
    expect((await app.bookings.sweep()).expiredPayments).toBe(1);
    expect(await status(booking.bookingId)).toBe("EXPIRED");
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } })).status).toBe(
      "ABANDONED",
    );
    expect(await sandboxStatus(paymentId)).toBe("authorized");
  });
});

describe("refunds without their webhook (S-06)", () => {
  /** A confirmed booking plus a stray capture whose reversal refund is queued. */
  async function queuedReversal() {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const paid = await app.payThroughSandbox(booking.renter, booking.bookingId);
    const stray = await app.sandbox.simulate(paid.orderId, "pay-captured");
    await app.payments.handleWebhook(stray.webhooks[0]!.body, stray.webhooks[0]!.headers);
    const refund = await db.refund.findFirstOrThrow({ where: { reason: "UNEXPECTED_CAPTURE_REVERSAL" } });
    return { app, booking, strayId: stray.paymentIds[0]!, refund };
  }

  it("settles a refund the provider processed later by asking for it", async () => {
    const { app, refund } = await queuedReversal();
    app.sandbox.refunds.respondWith("PENDING");
    expect(await app.payments.dispatchRefunds()).toEqual({ claimed: 1, sent: 1 });
    const sent = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(sent).toMatchObject({ status: "INITIATED" });

    // Still pending at the provider: checked, left as it is.
    expect(await app.payments.reconcileRefunds()).toEqual({ checked: 1, settled: 0, errors: 0 });
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("INITIATED");

    await app.sandbox.refunds.settle(sent.providerRefundId!, "PROCESSED");
    expect(await app.payments.reconcileRefunds()).toEqual({ checked: 1, settled: 1, errors: 0 });
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
      status: "PROCESSED",
    });
    expect(await db.auditLog.count({ where: { action: "refund.processed", entityId: refund.id } })).toBe(1);
    // Nothing left to check, and a late webhook changes nothing.
    expect(await app.payments.reconcileRefunds()).toEqual({ checked: 0, settled: 0, errors: 0 });
  });

  it("matches a webhook to a refund whose provider id was never stored, by our reference", async () => {
    const { app, strayId, refund } = await queuedReversal();
    // A worker claims the refund and has the provider create it, then dies before storing the id.
    const [claimed] = await prismaPaymentRepository(db).claimRefunds(10);
    const created = await app.sandbox.provider.createRefund({
      providerPaymentId: claimed!.providerPaymentId,
      amountPaise: claimed!.amountPaise,
      reference: claimed!.id,
    });
    expect(claimed!.providerPaymentId).toBe(strayId);

    const webhook = app.sandbox.webhooks.refund("processed", {
      refundId: created.providerRefundId,
      paymentId: strayId,
      amountPaise: refund.amountPaise,
      reference: refund.id,
    });
    expect(await app.payments.handleWebhook(webhook.body, webhook.headers)).toEqual({
      status: 200,
      body: "ok",
    });
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
      status: "PROCESSED",
      providerRefundId: created.providerRefundId,
    });
    // The lease reclaim never sends it again.
    expect(await app.payments.dispatchRefunds()).toEqual({ claimed: 0, sent: 0 });
  });

  it("never settles, by reference, a refund that has not been sent", async () => {
    const { app, strayId, refund } = await queuedReversal();
    const webhook = app.sandbox.webhooks.refund("processed", {
      refundId: "rfnd_unknown",
      paymentId: strayId,
      amountPaise: refund.amountPaise,
      reference: refund.id,
    });
    await app.payments.handleWebhook(webhook.body, webhook.headers);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("PENDING");
  });

  it("marks a refund the provider failed, and an administrator's retry ignores the old attempt", async () => {
    const { app, strayId, refund } = await queuedReversal();
    app.sandbox.refunds.respondWith("PENDING");
    await app.payments.dispatchRefunds();
    const first = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    await app.sandbox.refunds.settle(first.providerRefundId!, "FAILED");
    const failed = app.sandbox.webhooks.refund("failed", {
      refundId: first.providerRefundId!,
      paymentId: strayId,
      amountPaise: refund.amountPaise,
      reference: refund.id,
    });
    await app.payments.handleWebhook(failed.body, failed.headers);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("FAILED");
    expect(await db.auditLog.count({ where: { action: "refund.failed", entityId: refund.id } })).toBe(1);

    // An administrator retries: the old attempt is forgotten, and the provider creates a fresh refund.
    expect(await prismaAdminRepository(db).retryRefund(refund.id)).toBe(true);
    // The provider delivers the old failure again (a new delivery, so not deduplicated by event id).
    const replay = app.sandbox.webhooks.refund("failed", {
      refundId: first.providerRefundId!,
      paymentId: strayId,
      amountPaise: refund.amountPaise,
      reference: refund.id,
    });
    await app.payments.handleWebhook(replay.body, replay.headers);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("PENDING");
    app.sandbox.refunds.respondWith("PROCESSED");
    expect(await app.payments.dispatchRefunds()).toEqual({ claimed: 1, sent: 1 });
    const retried = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(retried.status).toBe("PROCESSED");
    expect(retried.providerRefundId).not.toBe(first.providerRefundId);
  });

  it("keeps the money balanced: a reversal is never part of the booking's money", async () => {
    const { app, booking } = await queuedReversal();
    await app.payments.dispatchRefunds();
    // Close the booking (the reconciliation view covers closed bookings): the renter cancels.
    await app.bookings.cancel(booking.renter, { bookingId: booking.bookingId });
    await app.payments.dispatchRefunds();
    expect(await reconciliation(booking.bookingId)).toMatchObject({ imbalance_paise: 0 });
    const stray = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM v_unexpected_captures WHERE booking_id = ${booking.bookingId}::uuid`;
    expect(stray).toEqual([{ status: "PROCESSED" }]);
  });
});

describe("payment reconciliation sweep", () => {
  /** Reconciliation throttles on database time: make the order look older than it is. */
  const age = (bookingId: string, minutes: number) =>
    db.$executeRaw`UPDATE payments SET created_at = now() - make_interval(mins => ${minutes})
                   WHERE booking_id = ${bookingId}::uuid`;

  it("captures an authorisation whose webhook and callback never arrived", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    await app.sandbox.simulate(orderId, "pay"); // nothing is delivered

    expect(await app.payments.reconcilePayments()).toEqual({ checked: 0, applied: 0, errors: 0 });
    await age(booking.bookingId, 90);
    expect(await app.payments.reconcilePayments()).toEqual({ checked: 1, applied: 1, errors: 0 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).status).toBe(
      "CONFIRMED",
    );
    // Checked just now: not again until the next interval.
    expect(await app.payments.reconcilePayments()).toEqual({ checked: 0, applied: 0, errors: 0 });
  });

  it("finds a stray capture whose webhook was missed and reverses it", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const paid = await app.payThroughSandbox(booking.renter, booking.bookingId);
    const stray = await app.sandbox.simulate(paid.orderId, "pay-captured"); // nothing is delivered
    await age(booking.bookingId, 90);

    expect(await app.payments.reconcilePayments()).toMatchObject({ checked: 1, applied: 1 });
    expect(await db.refund.findMany({ where: { bookingId: booking.bookingId } })).toMatchObject([
      { reason: "UNEXPECTED_CAPTURE_REVERSAL", reversedProviderPaymentId: stray.paymentIds[0] },
    ]);
  });

  it("refunds a capture on an expired booking whose webhook was missed", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    app.clock.advance(13 * 60 * 60 * 1000);
    await app.bookings.sweep(); // nothing paid yet: expires
    await app.sandbox.simulate(orderId, "pay-captured"); // nothing is delivered
    await age(booking.bookingId, 90);

    await app.payments.reconcilePayments();
    const b = await db.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      include: { refunds: true },
    });
    expect(b.status).toBe("EXPIRED");
    expect(b.refunds).toMatchObject([{ reason: "LATE_CAPTURE_REVERSAL" }]);
  });

  it("retries a failed capture sooner than it checks other orders", async () => {
    let failures = 1;
    const app = buildBookingApp(undefined, {
      wrapProvider: (p): PaymentProvider => ({
        ...p,
        async capturePayment(id, amount) {
          if (failures-- > 0) throw new PaymentProviderError("TRANSIENT", "Razorpay request failed");
          return p.capturePayment(id, amount);
        },
      }),
    });
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    const sim = await app.sandbox.simulate(orderId, "pay-webhook-only");
    await app.payments.handleWebhook(sim.webhooks[0]!.body, sim.webhooks[0]!.headers);
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } })).status).toBe(
      "AUTHORIZED",
    );

    await age(booking.bookingId, 20); // due for an authorisation (15 min), not for other orders (60 min)
    expect(await app.payments.reconcilePayments()).toMatchObject({ checked: 1, applied: 1 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.bookingId } })).status).toBe(
      "CONFIRMED",
    );
  });

  it("leaves orders alone once nothing can be captured on them any more", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const orderId = await orderFor(app, booking);
    await app.sandbox.simulate(orderId, "pay");
    await age(booking.bookingId, 7 * 24 * 60);
    expect(await app.payments.reconcilePayments()).toEqual({ checked: 0, applied: 0, errors: 0 });
  });
});

describe("starting checkout twice at once", () => {
  it("creates one provider order, and the renter's payment on either session confirms the booking", async () => {
    const app = buildBookingApp();
    const booking = await approvedBooking(app);
    const sessions = await Promise.all([
      app.payments.startCheckout(booking.renter, booking.bookingId),
      app.payments.startCheckout(booking.renter, booking.bookingId),
    ]);
    const orderIds = sessions.map((s) => (s as { url: string }).url.split("/").pop()!);
    expect(orderIds[0]).toBe(orderIds[1]);
    const stored = await db.payment.findUniqueOrThrow({ where: { bookingId: booking.bookingId } });
    expect(stored.providerOrderId).toBe(orderIds[0]);

    const sim = await app.sandbox.simulate(orderIds[1]!, "pay-callback-only");
    expect((await app.payments.handleCallback(sim.callback!)).outcome).toBe("CONFIRMED");
  });
});
