"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import type { ActionResult } from "@/shared/contracts/action-result";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../_lib/action";

export async function updateProfileAction(input: unknown): Promise<ActionResult<undefined>> {
  const result = await runAction("updateProfile", async (actor) => {
    await container().users.updateProfile(actor, input);
    return undefined;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function addAddressAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("addAddress", async (actor) => {
    const address = await container().users.addAddress(actor, input);
    return { id: address.id };
  });
  if (result.ok) revalidatePath("/account/addresses");
  return result;
}

/** Address buttons are plain forms: report a failure on the page instead of silently doing nothing. */
function backToAddresses(result: ActionResult<unknown>): never {
  revalidatePath("/account/addresses");
  redirect(
    result.ok ? "/account/addresses" : `/account/addresses?error=${encodeURIComponent(result.error.message)}`,
  );
}

export async function removeAddressAction(formData: FormData): Promise<void> {
  backToAddresses(
    await runAction("removeAddress", (actor) =>
      container().users.removeAddress(actor, formDataToObject(formData)),
    ),
  );
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  backToAddresses(
    await runAction("setDefaultAddress", (actor) =>
      container().users.setDefaultAddress(actor, formDataToObject(formData)),
    ),
  );
}
