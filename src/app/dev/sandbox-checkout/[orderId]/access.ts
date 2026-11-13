import "server-only";
import { container } from "@/composition/container";
import { getActor } from "@/composition/session";

/**
 * The sandbox order and its booking, but only for the renter who is paying it. Anyone else (signed out,
 * the owner, another member) gets null, so they can neither see nor complete someone else's checkout.
 */
export async function sandboxOrderForRenter(orderId: string) {
  const { sandbox, db } = container();
  if (!sandbox) return null;
  const [actor, order] = await Promise.all([getActor(), sandbox.order(orderId)]);
  if (!actor || !order) return null;
  const payment = await db.payment.findFirst({
    where: { provider: "sandbox", providerOrderId: orderId },
    select: {
      bookingId: true,
      booking: { select: { renterId: true, reference: true, outfit: { select: { title: true } } } },
    },
  });
  if (!payment || payment.booking.renterId !== actor.userId) return null;
  return { order, payment };
}
