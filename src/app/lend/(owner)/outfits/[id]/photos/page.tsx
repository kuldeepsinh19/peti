import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { allowsPhotoUploads, isPublicDemo } from "@/config/env";
import { type ListingEditView, PHOTO_UPLOADS_DISABLED_MESSAGE } from "@/modules/listings";
import { ListingSteps } from "@/modules/listings/ui/listing-steps";
import { PhotoManager } from "@/modules/listings/ui/photo-manager";
import { DomainError } from "@/shared/domain/errors";
import { ButtonLink } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { removePhotoAction, setCoverPhotoAction, uploadPhotoAction } from "../../../actions";

export const metadata: Metadata = { title: "Photographs" };

export default async function ListingPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireActorOrRedirect(`/lend/outfits/${id}/photos`);
  let view: ListingEditView;
  try {
    view = await container().listings.getForEdit(actor, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const frozen = view.status === "SUSPENDED" || view.status === "ARCHIVED";
  const min = marketplacePolicy.minListingPhotos;
  const hasEnough = view.photos.length >= min;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={view.title}
        title={
          <>
            Show it <span className="display-italic">off</span>
          </>
        }
        lede={`Renters decide on the photographs. Add at least ${marketplacePolicy.minListingPhotos}: the front, the back and a close-up of the work. Good ones in daylight do more than eight dim ones.`}
      />
      <ListingSteps current="photos" outfitId={view.id} />
      <div className="mt-8 flex flex-col gap-4">
        {query.created === "1" ? (
          <Notice tone="success" title="Details saved as a draft">
            Renters cannot see it yet. Add photographs, then preview it and submit it for review.
          </Notice>
        ) : null}
        {view.status === "ACTIVE" || view.status === "PAUSED" ? (
          <Notice tone="warning" title="This listing is published">
            A new photograph sends it back for a quick review before renters see it. Changing the cover does
            not.
          </Notice>
        ) : null}
      </div>
      <div className="mt-10">
        {frozen ? (
          <p className="text-graphite">This listing can no longer be edited.</p>
        ) : (
          <PhotoManager
            outfitId={view.id}
            photos={view.photos}
            upload={uploadPhotoAction}
            remove={removePhotoAction}
            makeCover={setCoverPhotoAction}
            uploadsDisabledReason={allowsPhotoUploads() ? null : PHOTO_UPLOADS_DISABLED_MESSAGE}
            canRemove={!isPublicDemo()}
          />
        )}
      </div>
      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-ink pt-6">
        {hasEnough ? (
          <ButtonLink href={`/lend/outfits/${view.id}/preview`}>Continue to preview</ButtonLink>
        ) : (
          <p className="text-sm text-graphite">
            Add at least {min} photographs to continue ({view.photos.length} so far).
          </p>
        )}
        <ButtonLink href={`/lend/outfits/${view.id}/edit`} variant="quiet">
          Back to details
        </ButtonLink>
      </div>
    </div>
  );
}
