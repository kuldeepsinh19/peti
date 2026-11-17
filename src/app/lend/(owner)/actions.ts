"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import type { ActionResult } from "@/shared/contracts/action-result";
import { ValidationError } from "@/shared/domain/errors";
import { formDataToObject } from "@/shared/contracts/validation";
import { runAction } from "../../_lib/action";
import { LIMITS } from "../../_lib/limits";
import { ownerReturnPath } from "../../_lib/paths";
import { errorQuery } from "@/app/_lib/flash";

export async function createListingAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(
    "createListing",
    async (actor) => {
      const created = await container().listings.createListing(actor, input);
      revalidatePath("/lend/dashboard");
      return { redirectTo: `/lend/outfits/${created.id}/photos?created=1` };
    },
    LIMITS.listingWrite,
  );
}

export async function updateListingAction(
  outfitId: string,
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(
    "updateListing",
    async (actor) => {
      const result = await container().listings.updateListing(actor, outfitId, input);
      revalidatePath("/lend/dashboard");
      revalidatePath(`/lend/outfits/${outfitId}/edit`);
      return { redirectTo: `/lend/outfits/${outfitId}/edit?saved=${result.sentForReview ? "review" : "1"}` };
    },
    LIMITS.listingWrite,
  );
}

export async function uploadPhotoAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(
    "uploadPhoto",
    async (actor) => {
      const outfitId = String(formData.get("outfitId") ?? "");
      const file = formData.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        throw new ValidationError("Choose a photograph to upload.", { photo: ["Choose a photograph."] });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const photo = await container().listings.addPhoto(
        actor,
        outfitId,
        bytes,
        String(formData.get("altText") ?? ""),
      );
      revalidateListing(outfitId);
      return { id: photo.id };
    },
    LIMITS.photoUpload,
  );
}

export async function removePhotoAction(formData: FormData): Promise<ActionResult<undefined>> {
  return runAction("removePhoto", async (actor) => {
    await container().listings.removePhoto(actor, formDataToObject(formData));
    revalidateListing(String(formData.get("outfitId")));
    return undefined;
  });
}

/** Every owner page that shows a listing's photographs. */
function revalidateListing(outfitId: string) {
  for (const page of ["edit", "photos", "preview"]) revalidatePath(`/lend/outfits/${outfitId}/${page}`);
  revalidatePath("/lend/dashboard");
}

export async function setCoverPhotoAction(formData: FormData): Promise<ActionResult<undefined>> {
  return runAction("setCoverPhoto", async (actor) => {
    await container().listings.setCoverPhoto(actor, formDataToObject(formData));
    revalidateListing(String(formData.get("outfitId")));
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
const DONE_NOTICE: Record<StatusCommand, string> = {
  submitForReview: "submitted",
  withdrawFromReview: "withdrawn",
  pause: "paused",
  resume: "resumed",
  archive: "archived",
};

export async function listingStatusAction(formData: FormData): Promise<void> {
  const command = String(formData.get("command")) as StatusCommand;
  if (!COMMANDS.includes(command)) return;
  const input = formDataToObject(formData);
  const outfitId = String(input.outfitId);
  const target = ownerReturnPath(formData.get("returnTo"), `/lend/outfits/${outfitId}/edit`);
  const result = await runAction(command, (actor) => container().listings[command](actor, input));
  revalidateListing(outfitId);
  const { redirect } = await import("next/navigation");
  if (!result.ok) redirect(`${target}?${errorQuery(result.error.message)}`);
  // The edit page has always stayed put on success; the other owner pages say what happened.
  if (formData.get("returnTo")) redirect(`${target}?done=${DONE_NOTICE[command]}`);
}

export async function savePayoutAccountAction(formData: FormData): Promise<void> {
  const result = await runAction(
    "savePayoutAccount",
    (actor) => container().users.savePayoutAccount(actor, formDataToObject(formData)),
    LIMITS.payoutAccount,
  );
  revalidatePath("/lend/earnings");
  const { redirect } = await import("next/navigation");
  redirect(result.ok ? "/lend/earnings?saved=1" : "/lend/earnings?" + errorQuery(result.error.message));
}
