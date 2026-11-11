import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { addDays, localDate, localDateInIndia } from "@/shared/domain/local-date";
import { parseInput } from "@/shared/contracts/validation";
import { z } from "zod";
import { isLocalDate } from "@/shared/domain/local-date";
import { applyTransition, DatesUnavailableError, loadBooking } from "./core";
import type { BookingsDeps } from "./ports";

const blockSchema = z.object({
  outfitId: z.uuid(),
  from: z.string().refine(isLocalDate, "Choose a start date."),
  to: z.string().refine(isLocalDate, "Choose an end date."),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * The owner blocks dates (inclusive) on their own outfit. The block uses the same exclusion constraint as
 * bookings, so it can never overlap a held booking; pending requests for those dates are declined.
 */
export async function addOwnerBlock(deps: BookingsDeps, actor: Actor, input: unknown) {
  const user = requireUser(actor);
  const data = parseInput(blockSchema, input);
  const from = localDate(data.from);
  const to = localDate(data.to);
  if (to < from)
    throw new ValidationError("The end date must be on or after the start date.", {
      to: ["Before the start."],
    });
  if (from < localDateInIndia(deps.clock.now()))
    throw new ValidationError("Blocks cannot start in the past.", { from: ["In the past."] });
  return deps.uow.run(async (store) => {
    const outfit = await store.lockOutfit(data.outfitId);
    if (!outfit) throw new NotFoundError("Outfit");
    if (outfit.ownerId !== user.userId) throw new ForbiddenError("Only the owner can block dates.");
    const endsBefore = addDays(to, 1);
    const holdId = await store.insertBlock(outfit.id, from, endsBefore, data.note, user.userId);
    if (!holdId) throw new DatesUnavailableError();
    for (const id of await store.pendingOverlapping(outfit.id, from, endsBefore)) {
      const pending = await loadBooking(store, id);
      if (pending.status !== "PENDING_APPROVAL") continue;
      await applyTransition(store, pending, "autoRejectDatesTaken", "SYSTEM", {
        actorUserId: null,
        reason: "The owner made these dates unavailable.",
        patch: { closedReason: "DATES_UNAVAILABLE", expiresAt: null },
      });
    }
    return { holdId };
  });
}

export async function removeOwnerBlock(deps: BookingsDeps, actor: Actor, input: unknown) {
  const user = requireUser(actor);
  const { outfitId, holdId } = parseInput(z.object({ outfitId: z.uuid(), holdId: z.uuid() }), input);
  return deps.uow.run(async (store) => {
    const outfit = await store.lockOutfit(outfitId);
    if (!outfit) throw new NotFoundError("Outfit");
    if (outfit.ownerId !== user.userId) throw new ForbiddenError("Only the owner can change this calendar.");
    if (!(await store.deleteBlock(holdId, outfitId))) throw new NotFoundError("Blocked dates");
  });
}
