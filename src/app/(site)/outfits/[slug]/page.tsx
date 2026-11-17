import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { getActor } from "@/composition/session";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { AvailabilityCalendar } from "@/modules/bookings/ui/availability-calendar";
import { RentalPolicies } from "@/modules/bookings/ui/rental-policies";
import { OutfitDetailView } from "@/modules/search/ui/outfit-detail-view";
import { addDays, localDateInIndia } from "@/shared/domain/local-date";
import { NotFoundError } from "@/shared/domain/errors";
import { ButtonLink } from "@/shared/ui/button";
import { SubmitButton } from "@/shared/ui/submit-button";
import { Notice } from "@/shared/ui/feedback";
import { Page } from "@/shared/ui/layout";
import { toggleSavedAction } from "../actions";
import { BookingPanel } from "./booking-panel";
import { signedError } from "@/app/_lib/flash";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const actor = await getActor();
  try {
    return { actor, outfit: await container().search.outfit(actor, slug) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const outfit = await container()
    .search.outfit(null, (await params).slug)
    .catch(() => null);
  return outfit ? { title: outfit.title, description: outfit.description.slice(0, 160) } : {};
}

export default async function OutfitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const saveError = signedError(await searchParams, "saveError");
  const { actor, outfit } = await load(slug);
  const { search, reviews: reviewsModule, bookings, clock } = container();
  const [savedIds, reviews, unavailable] = await Promise.all([
    search.savedIds(actor),
    reviewsModule.forOutfit(outfit.id),
    bookings.unavailableRanges(outfit.id),
  ]);
  const today = localDateInIndia(clock.now());
  const saved = savedIds.has(outfit.id);
  const isOwner = actor?.userId === outfit.owner.id;

  return (
    <Page className="pt-8 lg:pt-12">
      {saveError ? (
        <Notice tone="danger" title="Could not update your saved outfits" className="mb-8">
          {saveError}
        </Notice>
      ) : null}
      {outfit.status !== "ACTIVE" ? (
        <Notice tone="warning" title="Not visible to renters" className="mb-8">
          This listing is {outfit.status.toLowerCase().replace("_", " ")}. Only you and administrators can see
          it.
        </Notice>
      ) : null}
      <OutfitDetailView
        outfit={outfit}
        reviews={reviews}
        availability={
          outfit.status === "ACTIVE" ? (
            <AvailabilityCalendar
              unavailable={unavailable}
              earliestStart={addDays(today, marketplacePolicy.minLeadDays)}
              latestStart={addDays(today, marketplacePolicy.maxAdvanceDays)}
              turnaroundDays={outfit.turnaroundDays}
            />
          ) : undefined
        }
        policies={
          <RentalPolicies depositPaise={outfit.depositPaise} turnaroundDays={outfit.turnaroundDays} />
        }
        actions={
          <>
            {isOwner ? (
              <div className="flex flex-col gap-3 border border-rule-strong p-5">
                <p className="font-display text-xl">This is your outfit</p>
                <p className="text-sm text-graphite">
                  Renters see a request button here. You manage it from My outfits.
                </p>
                <div className="flex flex-wrap gap-3">
                  <ButtonLink href={`/lend/outfits/${outfit.id}/edit`} variant="secondary" size="sm">
                    Edit listing
                  </ButtonLink>
                  <ButtonLink href={`/lend/outfits/${outfit.id}/photos`} variant="quiet" size="sm">
                    Photographs
                  </ButtonLink>
                  {outfit.status === "ACTIVE" || outfit.status === "PAUSED" ? (
                    <ButtonLink href={`/lend/outfits/${outfit.id}/calendar`} variant="quiet" size="sm">
                      Availability
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
            ) : outfit.status === "ACTIVE" ? (
              <BookingPanel outfit={outfit} actor={actor} searchParams={await searchParams} />
            ) : null}

            {!isOwner ? (
              actor ? (
                <form action={toggleSavedAction}>
                  <input type="hidden" name="outfitId" value={outfit.id} />
                  <input type="hidden" name="slug" value={outfit.slug} />
                  <SubmitButton variant="quiet">
                    {saved ? "Saved — remove from your list" : "Save for later"}
                  </SubmitButton>
                </form>
              ) : (
                <Link href={`/sign-in?next=/outfits/${outfit.slug}`} className="text-sm text-burgundy">
                  Sign in to save this outfit
                </Link>
              )
            ) : null}
          </>
        }
      />
    </Page>
  );
}
