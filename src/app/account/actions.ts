"use server";

import { revalidatePath } from "next/cache";
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

export async function removeAddressAction(formData: FormData): Promise<void> {
  await runAction("removeAddress", (actor) =>
    container().users.removeAddress(actor, formDataToObject(formData)),
  );
  revalidatePath("/account/addresses");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  await runAction("setDefaultAddress", (actor) =>
    container().users.setDefaultAddress(actor, formDataToObject(formData)),
  );
  revalidatePath("/account/addresses");
}
