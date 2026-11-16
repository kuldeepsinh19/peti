import type { Tone } from "@/shared/ui/feedback";
import type { OutfitStatus } from "../domain/outfit-status";

/** What each status means for the owner, in one line: shown under the status on My outfits. */
export const outfitStatusExplanation: Record<OutfitStatus, string> = {
  DRAFT: "Only you can see it. Add photographs, preview it and submit it for review.",
  PENDING_REVIEW: "Submitted. A Peti administrator checks it before renters can see it.",
  ACTIVE: "Renters can find and request it.",
  PAUSED: "Hidden from renters. Existing bookings go ahead; resume it to take new requests.",
  REJECTED: "The reviewer asked for changes. Edit it and submit it again.",
  SUSPENDED: "Suspended by Peti and hidden from everyone. Contact the administrators.",
  ARCHIVED: "Archived. Renters cannot see it.",
};

export const outfitStatusTone: Record<OutfitStatus, Tone> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  ACTIVE: "success",
  PAUSED: "neutral",
  REJECTED: "danger",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
};
