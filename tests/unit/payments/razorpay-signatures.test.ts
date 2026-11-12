import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkoutSignature, hmacSha256Hex, signaturesMatch } from "@/modules/payments/domain/signatures";
import {
  parseRazorpayWebhook,
  verifyRazorpayCallback,
} from "@/modules/payments/infrastructure/razorpay-provider";

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

/** Computed independently of the code under test. */
const reference = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

describe("HMAC helpers", () => {
  it("match the published HMAC-SHA256 test vector", () => {
    expect(hmacSha256Hex("The quick brown fox jumps over the lazy dog", "key")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("compare signatures without accepting malformed or truncated input", () => {
    const good = hmacSha256Hex("x", "k");
    expect(signaturesMatch(good, good)).toBe(true);
    expect(signaturesMatch(good, good.toUpperCase())).toBe(true);
    expect(signaturesMatch(good, undefined)).toBe(false);
    expect(signaturesMatch(good, "")).toBe(false);
    expect(signaturesMatch(good, good.slice(0, -2))).toBe(false);
    expect(signaturesMatch(good, good.slice(0, -1) + "z")).toBe(false);
    expect(signaturesMatch(good, hmacSha256Hex("y", "k"))).toBe(false);
  });
});

describe("Razorpay checkout callback", () => {
  const orderId = "order_TEST123";
  const paymentId = "pay_TEST456";

  it("signs order_id|payment_id with the key secret, as Razorpay documents", () => {
    expect(checkoutSignature(orderId, paymentId, KEY_SECRET)).toBe(
      reference(`${orderId}|${paymentId}`, KEY_SECRET),
    );
  });

  it("accepts a correctly signed callback", () => {
    const params = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: reference(`${orderId}|${paymentId}`, KEY_SECRET),
    };
    expect(verifyRazorpayCallback(params, KEY_SECRET)).toEqual({
      ok: true,
      providerOrderId: orderId,
      providerPaymentId: paymentId,
    });
  });

  it("rejects a signature for another order, another secret, or missing fields", () => {
    const forOther = reference(`order_OTHER|${paymentId}`, KEY_SECRET);
    expect(
      verifyRazorpayCallback(
        { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: forOther },
        KEY_SECRET,
      ),
    ).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(
      verifyRazorpayCallback(
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: reference(`${orderId}|${paymentId}`, "another_secret"),
        },
        KEY_SECRET,
      ),
    ).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verifyRazorpayCallback({ razorpay_order_id: orderId }, KEY_SECRET)).toMatchObject({
      ok: false,
      reason: "MISSING_FIELDS",
    });
  });
});

describe("Razorpay webhook", () => {
  const capturedBody = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_TEST456",
          order_id: "order_TEST123",
          status: "captured",
          amount: 1_250_000,
          currency: "INR",
          method: "upi",
        },
      },
    },
  });
  const headersFor = (body: string, secret = WEBHOOK_SECRET) => ({
    "x-razorpay-signature": reference(body, secret),
    "x-razorpay-event-id": "evt_TEST789",
  });

  it("parses a signed payment.captured event", () => {
    expect(parseRazorpayWebhook(capturedBody, headersFor(capturedBody), WEBHOOK_SECRET)).toEqual({
      ok: true,
      event: {
        eventId: "evt_TEST789",
        providerEventType: "payment.captured",
        type: "PAYMENT_CAPTURED",
        providerOrderId: "order_TEST123",
        providerPaymentId: "pay_TEST456",
        amountPaise: 1_250_000,
        currency: "INR",
        method: "upi",
      },
    });
  });

  it("verifies the signature over the exact raw body", () => {
    const reformatted = JSON.stringify(JSON.parse(capturedBody), null, 2);
    expect(parseRazorpayWebhook(reformatted, headersFor(capturedBody), WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: "BAD_SIGNATURE",
    });
    const tampered = capturedBody.replace("1250000", "1");
    expect(parseRazorpayWebhook(tampered, headersFor(capturedBody), WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("rejects the wrong secret, a missing signature and a missing event id", () => {
    expect(
      parseRazorpayWebhook(capturedBody, headersFor(capturedBody, "another_secret"), WEBHOOK_SECRET),
    ).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(
      parseRazorpayWebhook(capturedBody, { "x-razorpay-event-id": "evt_1" }, WEBHOOK_SECRET),
    ).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(
      parseRazorpayWebhook(
        capturedBody,
        { "x-razorpay-signature": reference(capturedBody, WEBHOOK_SECRET) },
        WEBHOOK_SECRET,
      ),
    ).toMatchObject({ ok: false, reason: "MALFORMED" });
  });

  it("maps refunds and ignores events it does not handle", () => {
    const refund = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_TEST456", amount: 800_000 } } },
    });
    expect(parseRazorpayWebhook(refund, headersFor(refund), WEBHOOK_SECRET)).toMatchObject({
      ok: true,
      event: { type: "REFUND_PROCESSED", providerRefundId: "rfnd_1", amountPaise: 800_000 },
    });
    const other = JSON.stringify({ event: "settlement.processed", payload: {} });
    expect(parseRazorpayWebhook(other, headersFor(other), WEBHOOK_SECRET)).toMatchObject({
      ok: true,
      event: { type: "IGNORED" },
    });
  });
});
