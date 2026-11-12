"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../../_lib/action";
import { LIMITS } from "../../_lib/limits";

export async function toggleSavedAction(formData: FormData): Promise<void> {
  const input = formDataToObject(formData);
  await runAction("toggleSaved", (actor) => container().search.toggleSaved(actor, input), LIMITS.savedToggle);
  if (typeof input.slug === "string") revalidatePath(`/outfits/${input.slug}`);
  revalidatePath("/account/saved");
}
