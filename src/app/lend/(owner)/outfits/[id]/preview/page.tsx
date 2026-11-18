import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { outfitStatusLabel, type ListingEditView } from "@/modules/listings";
import { RentalPolicies } from "@/modules/bookings/ui/rental-policies";
import { ListingSteps } from "@/modules/listings/ui/listing-steps";
import { outfitStatusTone } from "@/modules/listings/ui/status";
import { OutfitCardView } from "@/modules/search/ui/outfit-grid";
import { cardFromDetail, OutfitDetailView } from "@/modules/search/ui/outfit-detail-view";
import { DomainError } from "@/shared/domain/errors";
import { ButtonLink } from "@/shared/ui/button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import { StatusButton } from "../../../status-button";
import { signedError } from "@/app/_lib/flash";

export const metadata: Metadata = { title: "Preview your listing" };

/**
 * The owner's preview renders the real public components (the Explore card and the outfit page), so what
 * the owner approves is exactly what renters will see. Only the owner can open it.
 */
export default async function ListingPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireActorOrRedirect(`/lend/outfits/${id}/preview`);
  let view: ListingEditView;
  try {
    view = await container().listings.getForEdit(actor, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const outfit = await container().search.outfit(actor, view.slug);
  const s = view.status;
  const enoughPhotos = view.photos.length >= marketplacePolicy.minListingPhotos;
  const canSubmit = (s === "DRAFT" || s === "REJECTED") && enoughPhotos;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            Preview <Tag tone={outfitStatusTone[s]}>{outfitStatusLabel[s]}</Tag>
          </span>
        }
        title={
          <>
            As renters will <span className="display-italic">see</span> it
          </>
        }
        lede="Check the cover, the title, the price and the description. You can still change anything."
      />
      <ListingSteps current="preview" outfitId={view.id} />

      <div className="mt-8 flex flex-col gap-4">
        {signedError(query) ? (
          <Notice tone="danger" title="Not submitted">
            {signedError(query)}
          </Notice>
        ) : null}
        {s === "REJECTED" && view.moderationNote ? (
          <Notice tone="danger" title="What the reviewer asked you to change">
            {view.moderationNote}
          </Notice>
        ) : null}
        {!enoughPhotos ? (
          <Notice tone="warning" title="Add more photographs first">
            A listing needs at least {marketplacePolicy.minListingPhotos} photographs before it can be
            submitted: the front, the back and a close-up of the work. It has {view.photos.length}.
          </Notice>
        ) : null}
      </div>

      <section aria-labelledby="card-preview" className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionIndex index={1}>In Explore</SectionIndex>
          <h2 id="card-preview" className="mt-3 text-display-sm">
            The card
          </h2>
          <p className="mt-3 text-sm text-graphite">
            This is how your outfit appears among others in Explore outfits and in search results.
          </p>
        </div>
        <div className="max-w-xs lg:col-span-4 lg:col-start-6">
          <OutfitCardView item={cardFromDetail(outfit)} privatePhotos />
        </div>
      </section>

      <section aria-labelledby="page-preview" className="mt-16">
        <SectionIndex index={2}>The outfit page</SectionIndex>
        <h2 id="page-preview" className="sr-only">
          The outfit page
        </h2>
        <div className="mt-6 border border-rule-strong p-4 sm:p-8">
          <OutfitDetailView
            outfit={outfit}
            breadcrumb={false}
            privatePhotos
            policies={
              <RentalPolicies depositPaise={outfit.depositPaise} turnaroundDays={outfit.turnaroundDays} />
            }
            actions={
              <p className="border border-dashed border-rule-strong px-4 py-3 text-sm text-graphite">
                Renters see the request-to-rent button here once the listing is published.
              </p>
            }
          />
        </div>
      </section>

      <div className="sticky bottom-0 mt-12 flex flex-wrap items-center gap-4 border-t border-ink bg-paper py-5">
        {canSubmit ? (
          <StatusButton
            outfitId={view.id}
            command="submitForReview"
            label="Submit for review"
            variant="primary"
            returnTo="/lend/dashboard"
          />
        ) : null}
        <ButtonLink href={`/lend/outfits/${view.id}/edit`} variant="secondary">
          Edit details
        </ButtonLink>
        <ButtonLink href={`/lend/outfits/${view.id}/photos`} variant="quiet">
          Edit photographs
        </ButtonLink>
        <p className="w-full text-caption text-stone sm:w-auto">
          {canSubmit
            ? "A Peti administrator reviews every listing before it is published."
            : s === "PENDING_REVIEW"
              ? "Submitted: a Peti administrator is reviewing it."
              : null}
        </p>
      </div>
    </div>
  );
}
