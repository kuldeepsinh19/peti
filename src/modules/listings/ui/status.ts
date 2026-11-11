import type { Tone } from "@/shared/ui/feedback";
import type { OutfitStatus } from "../domain/outfit-status";

export const outfitStatusTone: Record<OutfitStatus, Tone> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  ACTIVE: "success",
  PAUSED: "neutral",
  REJECTED: "danger",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
};
