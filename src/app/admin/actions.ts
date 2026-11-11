"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../_lib/action";

type ModerationCommand = "approve" | "reject" | "suspend" | "reinstate";
const MODERATION: readonly ModerationCommand[] = ["approve", "reject", "suspend", "reinstate"];

export async function moderateListingAction(formData: FormData): Promise<void> {
  const command = String(formData.get("command")) as ModerationCommand;
  if (!MODERATION.includes(command)) return;
  const result = await runAction(`listing.${command}`, (actor) =>
    container().listings[command](actor, formDataToObject(formData)),
  );
  revalidatePath("/admin/listings");
  redirect(
    `/admin/listings?${result.ok ? `done=${command}` : `error=${encodeURIComponent(result.error.message)}`}`,
  );
}
