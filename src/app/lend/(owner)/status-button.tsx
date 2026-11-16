import { SubmitButton } from "@/shared/ui/submit-button";
import { listingStatusAction } from "./actions";

/**
 * A listing status command (submit, withdraw, pause, resume) as a plain form, so it works without
 * JavaScript. `returnTo` is where the owner lands afterwards (the action only accepts owner-area paths).
 */
export function StatusButton({
  outfitId,
  command,
  label,
  variant = "secondary",
  size,
  returnTo,
}: {
  outfitId: string;
  command: "submitForReview" | "withdrawFromReview" | "pause" | "resume" | "archive";
  label: string;
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm" | "md" | "lg";
  returnTo?: string;
}) {
  return (
    <form action={listingStatusAction}>
      <input type="hidden" name="outfitId" value={outfitId} />
      <input type="hidden" name="command" value={command} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <SubmitButton variant={variant} {...(size ? { size } : {})}>
        {label}
      </SubmitButton>
    </form>
  );
}
