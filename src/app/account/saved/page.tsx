import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { OutfitGrid } from "@/modules/search/ui/outfit-grid";
import { ButtonLink } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Saved outfits" };

export default async function SavedPage() {
  const actor = await requireActorOrRedirect("/account/saved");
  const items = await container().search.saved(actor);
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Your list" title="Saved outfits" />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet."
          className="mt-10"
          action={<ButtonLink href="/explore">Explore outfits</ButtonLink>}
        >
          Save outfits you like and come back to them when you know your dates.
        </EmptyState>
      ) : (
        <div className="mt-10">
          <OutfitGrid items={items} />
        </div>
      )}
    </div>
  );
}
