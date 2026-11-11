import Link from "next/link";
import type { OutfitDetail } from "@/modules/search";
import type { UserActor } from "@/shared/application/actor";
import { ButtonLink } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/feedback";

/**
 * Entry point for requesting dates. Signed-out visitors are sent to sign in; members without confirmed
 * contact details are sent to their account first. The request form itself is rendered by the bookings
 * module.
 */
export async function BookingPanel({
  outfit,
  actor,
}: {
  outfit: OutfitDetail;
  actor: UserActor | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!actor) {
    return (
      <div className="flex flex-col gap-3 border-y border-ink py-5">
        <p className="text-graphite">Sign in to choose dates and request this outfit.</p>
        <ButtonLink href={`/sign-in?next=/outfits/${outfit.slug}`}>Sign in to request</ButtonLink>
      </div>
    );
  }
  if (!actor.emailVerified || !actor.phoneVerified) {
    return (
      <Notice tone="warning" title="Verify your contact details to request">
        Confirm your email and mobile number on <Link href="/account">your account</Link> — the owner needs a
        way to reach you once the booking is paid.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3 border-y border-ink py-5">
      <ButtonLink href={`/outfits/${outfit.slug}/request`}>Choose your dates</ButtonLink>
      <p className="text-caption text-stone">Nothing is charged until the owner accepts your request.</p>
    </div>
  );
}
