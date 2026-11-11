import type { Metadata } from "next";
import { requireActorOrRedirect } from "@/composition/session";
import { ListingForm } from "@/modules/listings/ui/listing-form";
import { PageHeader } from "@/shared/ui/layout";
import { createListingAction } from "../../actions";
import { listingFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "List an outfit" };

export default async function NewListingPage() {
  const actor = await requireActorOrRedirect("/lend/outfits/new");
  const options = await listingFormOptions(actor);
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Step 1 of 2 — details"
        title={
          <>
            List an <span className="display-italic">outfit</span>
          </>
        }
        lede="Describe it honestly and measure it carefully: renters choose by these details, and the handover is checked against them."
      />
      <div className="mt-10">
        <ListingForm {...options} submitLabel="Save and add photographs" action={createListingAction} />
      </div>
    </div>
  );
}
