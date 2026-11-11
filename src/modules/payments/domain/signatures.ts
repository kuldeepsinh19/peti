import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Constant-time comparison of two hex signatures. */
export function signaturesMatch(expectedHex: string, receivedHex: string | undefined): boolean {
  if (!receivedHex || !/^[0-9a-f]+$/i.test(receivedHex) || receivedHex.length !== expectedHex.length)
    return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(receivedHex.toLowerCase(), "hex"));
}

/** Razorpay Checkout: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function checkoutSignature(orderId: string, paymentId: string, keySecret: string): string {
  return hmacSha256Hex(`${orderId}|${paymentId}`, keySecret);
}
