import { PreconditionError } from "@/shared/domain/errors";

export const OUTFIT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "PAUSED",
  "REJECTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;
export type OutfitStatus = (typeof OUTFIT_STATUSES)[number];

export type OutfitCommand =
  | "submit"
  | "withdraw"
  | "approve"
  | "reject"
  | "pause"
  | "resume"
  | "contentEdited"
  | "archive"
  | "suspend"
  | "reinstate";

type Who = "owner" | "admin" | "system";

/**
 * Listing moderation lifecycle. Owners never publish directly: every new listing, and every change to
 * what renters see (photos, title, description, category), goes through an administrator.
 */
const TRANSITIONS: ReadonlyArray<{
  command: OutfitCommand;
  from: readonly OutfitStatus[];
  to: OutfitStatus;
  by: Who;
}> = [
  { command: "submit", from: ["DRAFT", "REJECTED"], to: "PENDING_REVIEW", by: "owner" },
  { command: "withdraw", from: ["PENDING_REVIEW"], to: "DRAFT", by: "owner" },
  { command: "approve", from: ["PENDING_REVIEW"], to: "ACTIVE", by: "admin" },
  { command: "reject", from: ["PENDING_REVIEW"], to: "REJECTED", by: "admin" },
  { command: "pause", from: ["ACTIVE"], to: "PAUSED", by: "owner" },
  { command: "resume", from: ["PAUSED"], to: "ACTIVE", by: "owner" },
  { command: "contentEdited", from: ["ACTIVE", "PAUSED"], to: "PENDING_REVIEW", by: "system" },
  {
    command: "archive",
    from: ["DRAFT", "PENDING_REVIEW", "ACTIVE", "PAUSED", "REJECTED"],
    to: "ARCHIVED",
    by: "owner",
  },
  { command: "suspend", from: ["PENDING_REVIEW", "ACTIVE", "PAUSED"], to: "SUSPENDED", by: "admin" },
  { command: "reinstate", from: ["SUSPENDED"], to: "PAUSED", by: "admin" },
];

export function nextOutfitStatus(current: OutfitStatus, command: OutfitCommand, by: Who): OutfitStatus {
  const rule = TRANSITIONS.find((t) => t.command === command && t.by === by && t.from.includes(current));
  if (!rule) {
    throw new PreconditionError(
      "LISTING_STATE_CONFLICT",
      `This listing cannot be changed that way while it is ${current.toLowerCase().replace("_", " ")}.`,
      { current, command },
    );
  }
  return rule.to;
}

/** Owners may edit while the listing is theirs to change; suspended or archived listings are frozen. */
export function isEditable(status: OutfitStatus): boolean {
  return status !== "SUSPENDED" && status !== "ARCHIVED";
}

/** Only content renters see triggers re-review; prices, deposit and availability settings do not. */
export function editNeedsReview(status: OutfitStatus, contentChanged: boolean): boolean {
  return contentChanged && (status === "ACTIVE" || status === "PAUSED");
}

export const outfitStatusLabel: Record<OutfitStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "In review",
  ACTIVE: "Live",
  PAUSED: "Paused",
  REJECTED: "Changes requested",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};
