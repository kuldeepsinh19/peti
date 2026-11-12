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
  const result = await runAction("listing." + command, async (actor): Promise<void> => {
    await container().listings[command](actor, formDataToObject(formData));
  });
  revalidatePath("/admin/listings");
  redirect(
    "/admin/listings?" +
      (result.ok ? "done=" + command : "error=" + encodeURIComponent(result.error.message)),
  );
}

type AdminCommand = "suspendUser" | "reinstateUser" | "markPayoutPaid" | "createCategory" | "toggleCategory";
const ADMIN: Record<AdminCommand, string> = {
  suspendUser: "/admin/users",
  reinstateUser: "/admin/users",
  markPayoutPaid: "/admin/payouts",
  createCategory: "/admin/categories",
  toggleCategory: "/admin/categories",
};

/** Form endpoint for admin commands. Authorisation happens in the use case, not here. */
export async function adminCommandAction(formData: FormData): Promise<void> {
  const command = String(formData.get("command")) as AdminCommand;
  const path = ADMIN[command];
  if (!path) return;
  const result = await runAction("admin." + command, async (actor): Promise<void> => {
    await container().admin[command](actor, formDataToObject(formData));
  });
  revalidatePath(path);
  redirect(path + "?" + (result.ok ? "done=1" : "error=" + encodeURIComponent(result.error.message)));
}
