"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../../_lib/action";
import { LIMITS } from "../../_lib/limits";

export async function toggleSavedAction(formData: FormData): Promise<void> {
  const input = formDataToObject(formData);
  const result = await runAction(
    "toggleSaved",
    (actor) => container().search.toggleSaved(actor, input),
    LIMITS.savedToggle,
  );
  const slug = typeof input.slug === "string" && /^[a-z0-9-]{1,200}$/.test(input.slug) ? input.slug : null;
  if (slug) revalidatePath(`/outfits/${slug}`);
  revalidatePath("/account/saved");
  // A refused toggle (signed out, rate limit) is reported on the page instead of silently doing nothing.
  if (!result.ok && slug) redirect(`/outfits/${slug}?saveError=${encodeURIComponent(result.error.message)}`);
}
