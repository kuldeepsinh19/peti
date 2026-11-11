"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import type { ActionResult } from "@/shared/contracts/action-result";
import { ValidationError } from "@/shared/domain/errors";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../../_lib/action";

export async function createListingAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("createListing", async (actor) => {
    const created = await container().listings.createListing(actor, input);
    revalidatePath("/lend/dashboard");
    return { redirectTo: `/lend/outfits/${created.id}/edit?created=1#photos` };
  });
}

export async function updateListingAction(
  outfitId: string,
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("updateListing", async (actor) => {
    const result = await container().listings.updateListing(actor, outfitId, input);
    revalidatePath("/lend/dashboard");
    revalidatePath(`/lend/outfits/${outfitId}/edit`);
    return { redirectTo: `/lend/outfits/${outfitId}/edit?saved=${result.sentForReview ? "review" : "1"}` };
  });
}

export async function uploadPhotoAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction("uploadPhoto", async (actor) => {
    const outfitId = String(formData.get("outfitId") ?? "");
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Choose a photograph to upload.", { photo: ["Choose a photograph."] });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await container().rateLimiter.consume(
      { name: "photo-upload", limit: 40, windowSeconds: 3600 },
      actor.userId,
    );
    const photo = await container().listings.addPhoto(
      actor,
      outfitId,
      bytes,
      String(formData.get("altText") ?? ""),
    );
    revalidatePath(`/lend/outfits/${outfitId}/edit`);
    return { id: photo.id };
  });
}

export async function removePhotoAction(formData: FormData): Promise<ActionResult<undefined>> {
  return runAction("removePhoto", async (actor) => {
    await container().listings.removePhoto(actor, formDataToObject(formData));
    revalidatePath(`/lend/outfits/${String(formData.get("outfitId"))}/edit`);
    return undefined;
  });
}

type StatusCommand = "submitForReview" | "withdrawFromReview" | "pause" | "resume" | "archive";
const COMMANDS: readonly StatusCommand[] = [
  "submitForReview",
  "withdrawFromReview",
  "pause",
  "resume",
  "archive",
];

/** One form-post endpoint for the owner's status buttons. Errors are returned to the page via a query flag. */
export async function listingStatusAction(formData: FormData): Promise<void> {
  const command = String(formData.get("command")) as StatusCommand;
  if (!COMMANDS.includes(command)) return;
  const input = formDataToObject(formData);
  const result = await runAction(command, (actor) => container().listings[command](actor, input));
  revalidatePath("/lend/dashboard");
  revalidatePath(`/lend/outfits/${String(input.outfitId)}/edit`);
  if (!result.ok) {
    const { redirect } = await import("next/navigation");
    redirect(
      `/lend/outfits/${String(input.outfitId)}/edit?error=${encodeURIComponent(result.error.message)}`,
    );
  }
}
