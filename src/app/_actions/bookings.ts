"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import type { ActionResult } from "@/shared/contracts/action-result";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../_lib/action";
import { LIMITS } from "../_lib/limits";
import { isSafeReturnPath } from "../_lib/paths";

/** Booking pages live under three areas; refresh all views of a booking after any change. */
function refresh(bookingId: string) {
  revalidatePath(`/account/rentals/${bookingId}`);
  revalidatePath(`/lend/requests/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/account/rentals");
  revalidatePath("/lend/requests");
}

export async function requestBookingAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("requestBooking", async (actor) => {
    const { bookingId } = await container().bookings.request(actor, input);
    revalidatePath("/account/rentals");
    return { redirectTo: `/account/rentals/${bookingId}?requested=1` };
  });
}

type SimpleCommand =
  | "approve"
  | "reject"
  | "withdraw"
  | "cancel"
  | "acknowledgeHandover"
  | "confirmReturn"
  | "acceptClaim"
  | "withdrawDispute"
  | "openDispute"
  | "resolveDispute"
  | "addDisputeMessage";

const SIMPLE: readonly SimpleCommand[] = [
  "approve",
  "reject",
  "withdraw",
  "cancel",
  "acknowledgeHandover",
  "confirmReturn",
  "acceptClaim",
  "withdrawDispute",
  "openDispute",
  "resolveDispute",
  "addDisputeMessage",
];

/**
 * One form endpoint for booking buttons. The use case decides whether this actor may do this now; the
 * result comes back to the page as a query flag so it works without JavaScript.
 */
export async function bookingCommandAction(formData: FormData): Promise<void> {
  const command = String(formData.get("command")) as SimpleCommand;
  const returnTo = String(formData.get("returnTo") ?? "/account/rentals");
  if (!SIMPLE.includes(command) || !isSafeReturnPath(returnTo)) return;
  const input = formDataToObject(formData);
  const writesText = command === "openDispute" || command === "addDisputeMessage";
  const result = await runAction(
    `booking.${command}`,
    async (actor): Promise<void> => {
      await container().bookings[command](actor, input);
    },
    writesText ? LIMITS.disputeWrite : undefined,
  );
  refresh(String(input.bookingId));
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(
    `${returnTo}${sep}${result.ok ? `done=${command}` : `error=${encodeURIComponent(result.error.message)}`}`,
  );
}

/** Condition reports carry photographs, so they are submitted as multipart form data. */
export async function conditionReportAction(formData: FormData): Promise<ActionResult<undefined>> {
  return runAction(
    "conditionReport",
    async (actor) => {
      const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
      const bytes = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
      const input = formDataToObject(formData);
      if (input.kind === "RETURN") await container().bookings.recordReturn(actor, input, bytes);
      else await container().bookings.submitHandoverReport(actor, input, bytes);
      refresh(String(input.bookingId));
      return undefined;
    },
    LIMITS.reportUpload,
  );
}

/** Starts checkout and sends the renter to the provider (redirect) or returns the SDK config. */
export async function startCheckoutAction(bookingId: string) {
  return runAction("startCheckout", (actor) => container().payments.startCheckout(actor, bookingId));
}

export async function calendarBlockAction(formData: FormData): Promise<void> {
  const input = formDataToObject(formData);
  const remove = input.intent === "remove";
  const result = await runAction("calendarBlock", async (actor): Promise<void> => {
    if (remove) await container().bookings.removeOwnerBlock(actor, input);
    else await container().bookings.addOwnerBlock(actor, input);
  });
  const path = `/lend/outfits/${String(input.outfitId)}/calendar`;
  revalidatePath(path);
  redirect(`${path}?${result.ok ? "done=1" : `error=${encodeURIComponent(result.error.message)}`}`);
}
