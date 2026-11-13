import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInr } from "@/shared/domain/money";
import { Notice } from "@/shared/ui/feedback";
import { Page, PageHeader } from "@/shared/ui/layout";
import { sandboxOrderForRenter } from "./access";
import { CheckoutPanel } from "./checkout-panel";

export const metadata: Metadata = { title: "Sandbox checkout", robots: { index: false } };

/**
 * A stand-in for a hosted payment page, available only in local and test environments. Choosing an outcome
 * makes the sandbox provider send signed messages to the app; nothing here can mark a booking paid directly.
 */
export default async function SandboxCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const checkout = await sandboxOrderForRenter(orderId);
  if (!checkout) notFound();
  const { order, payment } = checkout;
  return (
    <Page className="max-w-3xl pb-16">
      <PageHeader
        eyebrow="Sandbox payment provider"
        title="Checkout"
        lede={`${payment.booking.outfit.title} · ${payment.booking.reference}`}
      />
      <div className="mt-8 flex flex-col gap-8">
        <p className="font-display text-display-sm numeral">{formatInr(order.amountPaise)}</p>
        {order.status === "paid" ? (
          <Notice tone="success" title="This order has already been paid" />
        ) : (
          <CheckoutPanel orderId={orderId} bookingUrl={`/account/rentals/${payment.bookingId}`} />
        )}
        <p className="text-caption text-stone">
          No real money moves. In production this page is the payment provider&rsquo;s checkout (Razorpay in
          test mode), and this route does not exist.
        </p>
      </div>
    </Page>
  );
}
