import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Razorpay adapter against a stubbed SDK: request shapes and status mapping only. It has never been
 * run against Razorpay (no credentials exist), so these tests pin what the official docs describe.
 */
const sdk = vi.hoisted(() => ({
  orders: { create: vi.fn(), fetchPayments: vi.fn() },
  payments: { fetch: vi.fn(), capture: vi.fn(), refund: vi.fn(), fetchMultipleRefund: vi.fn() },
  refunds: { fetch: vi.fn() },
}));
vi.mock("razorpay", () => ({
  default: vi.fn(function Razorpay() {
    return sdk;
  }),
}));

const { MANUAL_CAPTURE_WINDOW_MINUTES, buildOrderRequest, parseRazorpayWebhook, razorpayProvider } =
  await import("@/modules/payments/infrastructure/razorpay-provider");
const { PaymentProviderError } = await import("@/modules/payments/domain/payment-provider");

const WEBHOOK_SECRET = "test_webhook_secret";
const provider = razorpayProvider({
  keyId: "rzp_test_x",
  keySecret: "test_key_secret",
  webhookSecret: WEBHOOK_SECRET,
});
const signed = (event: string, payload: unknown) => {
  const body = JSON.stringify({ event, payload });
  return {
    body,
    headers: {
      "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      "x-razorpay-event-id": "evt_1",
    },
  };
};
const rzpPayment = (status: string, id = "pay_1") => ({
  id,
  order_id: "order_1",
  status,
  amount: 1_250_000,
  currency: "INR",
  method: "upi",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orders", () => {
  it("are created for manual capture, overriding the dashboard setting (ADR-006)", async () => {
    const input = { reference: "pmt_1", amountPaise: 1_250_000, notes: { bookingId: "b1" } };
    expect(buildOrderRequest(input)).toEqual({
      amount: 1_250_000,
      currency: "INR",
      receipt: "pmt_1",
      notes: { bookingId: "b1" },
      payment: {
        capture: "manual",
        capture_options: { manual_expiry_period: MANUAL_CAPTURE_WINDOW_MINUTES, refund_speed: "normal" },
      },
    });
    // Razorpay accepts up to 5 days; the window must outlast the 12-hour payment window.
    expect(MANUAL_CAPTURE_WINDOW_MINUTES).toBeGreaterThan(12 * 60);
    expect(MANUAL_CAPTURE_WINDOW_MINUTES).toBeLessThanOrEqual(7200);

    sdk.orders.create.mockResolvedValue({ id: "order_1" });
    expect(await provider.createOrder(input)).toEqual({ providerOrderId: "order_1" });
    expect(sdk.orders.create).toHaveBeenCalledWith(buildOrderRequest(input));
  });
});

describe("payments", () => {
  it("captures for the exact amount in INR and maps the result", async () => {
    sdk.payments.capture.mockResolvedValue(rzpPayment("captured"));
    expect(await provider.capturePayment("pay_1", 1_250_000)).toMatchObject({
      providerPaymentId: "pay_1",
      status: "CAPTURED",
      amountPaise: 1_250_000,
    });
    expect(sdk.payments.capture).toHaveBeenCalledWith("pay_1", 1_250_000, "INR");
  });

  it("lists every attempt on an order, refunded ones included", async () => {
    sdk.orders.fetchPayments.mockResolvedValue({
      items: [
        rzpPayment("authorized", "pay_1"),
        rzpPayment("refunded", "pay_2"),
        rzpPayment("failed", "pay_3"),
      ],
    });
    expect((await provider.listOrderPayments("order_1")).map((p) => p.status)).toEqual([
      "AUTHORIZED",
      "REFUNDED",
      "FAILED",
    ]);
  });

  it("turns SDK errors into provider errors without leaking the response", async () => {
    sdk.payments.capture.mockRejectedValue({ statusCode: 400, error: { description: "already captured" } });
    const rejected = await provider.capturePayment("pay_1", 1).catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(PaymentProviderError);
    expect(rejected).toMatchObject({ kind: "REJECTED", message: "Razorpay request failed" });

    sdk.payments.fetch.mockRejectedValue({ statusCode: 502 });
    await expect(provider.fetchPayment("pay_1")).rejects.toMatchObject({ kind: "TRANSIENT" });
  });
});

describe("refunds", () => {
  it("reuse an earlier refund with our reference, but not a failed one", async () => {
    sdk.payments.fetchMultipleRefund.mockResolvedValue({
      items: [
        { id: "rfnd_failed", status: "failed", notes: { reference: "ref_1" } },
        { id: "rfnd_ok", status: "pending", notes: { reference: "ref_1" } },
      ],
    });
    expect(
      await provider.createRefund({ providerPaymentId: "pay_1", amountPaise: 100, reference: "ref_1" }),
    ).toEqual({ providerRefundId: "rfnd_ok", status: "PENDING" });
    expect(sdk.payments.refund).not.toHaveBeenCalled();

    sdk.payments.fetchMultipleRefund.mockResolvedValue({
      items: [{ id: "rfnd_failed", status: "failed", notes: { reference: "ref_1" } }],
    });
    sdk.payments.refund.mockResolvedValue({ id: "rfnd_new", status: "processed" });
    expect(
      await provider.createRefund({ providerPaymentId: "pay_1", amountPaise: 100, reference: "ref_1" }),
    ).toEqual({ providerRefundId: "rfnd_new", status: "PROCESSED" });
    expect(sdk.payments.refund).toHaveBeenCalledWith("pay_1", { amount: 100, notes: { reference: "ref_1" } });
  });

  it("are fetched to settle a refund whose webhook never arrived", async () => {
    for (const [status, expected] of [
      ["processed", "PROCESSED"],
      ["failed", "FAILED"],
      ["pending", "PENDING"],
    ] as const) {
      sdk.refunds.fetch.mockResolvedValue({ id: "rfnd_1", status });
      expect(await provider.fetchRefund("rfnd_1")).toEqual({ providerRefundId: "rfnd_1", status: expected });
    }
  });
});

describe("webhooks", () => {
  it("carry our refund reference from the notes, when there is one (S-06)", () => {
    const withRef = signed("refund.failed", {
      refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 100, notes: { reference: "ref_1" } } },
    });
    expect(parseRazorpayWebhook(withRef.body, withRef.headers, WEBHOOK_SECRET)).toMatchObject({
      ok: true,
      event: { type: "REFUND_FAILED", providerRefundId: "rfnd_1", reference: "ref_1" },
    });
    // Razorpay sends empty notes as an array.
    const noNotes = signed("refund.processed", {
      refund: { entity: { id: "rfnd_2", payment_id: "pay_1", amount: 100, notes: [] } },
    });
    expect(parseRazorpayWebhook(noNotes.body, noNotes.headers, WEBHOOK_SECRET)).toMatchObject({
      ok: true,
      event: { type: "REFUND_PROCESSED", reference: null },
    });
  });

  it("parse payment.authorized, which Peti then captures", () => {
    const w = signed("payment.authorized", { payment: { entity: rzpPayment("authorized") } });
    expect(parseRazorpayWebhook(w.body, w.headers, WEBHOOK_SECRET)).toMatchObject({
      ok: true,
      event: { type: "PAYMENT_AUTHORIZED", providerPaymentId: "pay_1", amountPaise: 1_250_000 },
    });
  });

  it("parse chargebacks", () => {
    for (const [event, type] of [
      ["payment.dispute.created", "DISPUTE_OPENED"],
      ["payment.dispute.won", "DISPUTE_WON"],
      ["payment.dispute.lost", "DISPUTE_LOST"],
      ["payment.dispute.closed", "DISPUTE_CLOSED"],
    ] as const) {
      const w = signed(event, {
        payment: { entity: rzpPayment("captured") },
        dispute: { entity: { id: "disp_1", payment_id: "pay_1", amount: 1_250_000, reason_code: "fraud" } },
      });
      expect(parseRazorpayWebhook(w.body, w.headers, WEBHOOK_SECRET)).toEqual({
        ok: true,
        event: {
          eventId: "evt_1",
          providerEventType: event,
          type,
          providerDisputeId: "disp_1",
          providerPaymentId: "pay_1",
          amountPaise: 1_250_000,
          reasonCode: "fraud",
        },
      });
    }
  });
});
