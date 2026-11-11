import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { type ListingEditView, mmToCm, outfitStatusLabel } from "@/modules/listings";
import { ListingForm } from "@/modules/listings/ui/listing-form";
import { PhotoManager } from "@/modules/listings/ui/photo-manager";
import { outfitStatusTone } from "@/modules/listings/ui/status";
import { DomainError } from "@/shared/domain/errors";
import { Button } from "@/shared/ui/button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import {
  listingStatusAction,
  removePhotoAction,
  updateListingAction,
  uploadPhotoAction,
} from "../../../actions";
import { listingFormOptions } from "../../../form-options";

export const metadata: Metadata = { title: "Edit listing" };

function defaultsFrom(view: ListingEditView) {
  const price = (days: number) => {
    const p = view.prices.find((x) => x.durationDays === days);
    return p ? String(p.pricePaise / 100) : "";
  };
  const cm = (mm: number | null) => (mm === null ? "" : String(mmToCm(mm)));
  return {
    title: view.title,
    description: view.description,
    categoryId: view.categoryId,
    brand: view.brand ?? "",
    colour: view.colour ?? "",
    fabric: view.fabric ?? "",
    sizeLabel: view.sizeLabel as "M",
    conditionGrade: view.conditionGrade as "EXCELLENT",
    conditionNotes: view.conditionNotes,
    retailValueRupees: String(view.retailValuePaise / 100),
    depositRupees: String(view.depositPaise / 100),
    turnaroundDays: String(view.turnaroundDays),
    occasions: view.occasions as Array<"WEDDING">,
    localityId: view.localityId,
    pickupAddressId: view.pickupAddressId,
    price2: price(2),
    price3: price(3),
    price5: price(5),
    price7: price(7),
    chest: cm(view.measurementsMm.chest),
    waist: cm(view.measurementsMm.waist),
    hip: cm(view.measurementsMm.hip),
    shoulder: cm(view.measurementsMm.shoulder),
    sleeve: cm(view.measurementsMm.sleeve),
    length: cm(view.measurementsMm.length),
    bottomWaist: cm(view.measurementsMm.bottomWaist),
    bottomLength: cm(view.measurementsMm.bottomLength),
    measurementNotes: view.measurementNotes ?? "",
  };
}

function StatusButton({
  outfitId,
  command,
  label,
  variant = "secondary",
}: {
  outfitId: string;
  command: string;
  label: string;
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <form action={listingStatusAction}>
      <input type="hidden" name="outfitId" value={outfitId} />
      <input type="hidden" name="command" value={command} />
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireActorOrRedirect(`/lend/outfits/${id}/edit`);
  let view: ListingEditView;
  try {
    view = await container().listings.getForEdit(actor, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const options = await listingFormOptions(actor);
  const update = updateListingAction.bind(null, view.id);
  const s = view.status;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            Edit listing <Tag tone={outfitStatusTone[s]}>{outfitStatusLabel[s]}</Tag>
          </span>
        }
        title={view.title}
        actions={
          <>
            {s === "DRAFT" || s === "REJECTED" ? (
              <StatusButton
                outfitId={view.id}
                command="submitForReview"
                label="Submit for review"
                variant="primary"
              />
            ) : null}
            {s === "PENDING_REVIEW" ? (
              <StatusButton outfitId={view.id} command="withdrawFromReview" label="Withdraw from review" />
            ) : null}
            {s === "ACTIVE" ? <StatusButton outfitId={view.id} command="pause" label="Pause" /> : null}
            {s === "PAUSED" ? (
              <StatusButton outfitId={view.id} command="resume" label="Resume" variant="primary" />
            ) : null}
            {s === "ACTIVE" || s === "PAUSED" ? (
              <Link href={`/lend/outfits/${view.id}/calendar`} className="self-center text-sm">
                Calendar
              </Link>
            ) : null}
            <Link href={`/outfits/${view.slug}`} className="self-center text-sm">
              View listing
            </Link>
          </>
        }
      />

      <div className="mt-8 flex flex-col gap-4">
        {typeof query.error === "string" ? (
          <Notice tone="danger" title="That did not work">
            {query.error}
          </Notice>
        ) : null}
        {query.created === "1" ? (
          <Notice tone="success" title="Saved as a draft">
            Now add photographs, then submit the listing for review.
          </Notice>
        ) : null}
        {query.saved === "1" ? <Notice tone="success" title="Changes saved" /> : null}
        {query.saved === "review" ? (
          <Notice tone="warning" title="Changes saved and sent for review">
            You changed what renters see, so an administrator will check the listing again before it goes back
            live.
          </Notice>
        ) : null}
        {s === "REJECTED" && view.moderationNote ? (
          <Notice tone="danger" title="Changes requested by the reviewer">
            {view.moderationNote}
          </Notice>
        ) : null}
        {s === "SUSPENDED" ? (
          <Notice tone="danger" title="Suspended">
            {view.moderationNote ?? "Contact the administrators."}
          </Notice>
        ) : null}
        {s === "PENDING_REVIEW" ? (
          <Notice title="In review">An administrator checks every listing before it is published.</Notice>
        ) : null}
      </div>

      <section id="photos" aria-labelledby="photos-title" className="mt-12 scroll-mt-8">
        <SectionIndex index={1}>Photographs</SectionIndex>
        <h2 id="photos-title" className="mt-3 mb-6 text-display-sm">
          Photographs
        </h2>
        <PhotoManager
          outfitId={view.id}
          photos={view.photos}
          upload={uploadPhotoAction}
          remove={removePhotoAction}
        />
      </section>

      <section aria-labelledby="details-title" className="mt-16">
        <SectionIndex index={2}>Details</SectionIndex>
        <h2 id="details-title" className="mt-3 mb-6 text-display-sm">
          Details
        </h2>
        {s === "SUSPENDED" || s === "ARCHIVED" ? (
          <p className="text-graphite">This listing can no longer be edited.</p>
        ) : (
          <ListingForm
            {...options}
            defaults={defaultsFrom(view)}
            submitLabel="Save changes"
            action={update}
          />
        )}
      </section>

      {s !== "ARCHIVED" && s !== "SUSPENDED" ? (
        <section aria-label="Archive" className="mt-16 border-t border-rule pt-6">
          <p className="mb-3 text-sm text-graphite">
            Archiving removes the listing permanently. Outfits with bookings in progress cannot be archived.
          </p>
          <StatusButton outfitId={view.id} command="archive" label="Archive listing" variant="quiet" />
        </section>
      ) : null}
    </div>
  );
}
