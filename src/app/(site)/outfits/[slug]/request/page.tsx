import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { RequestForm } from "@/modules/bookings/ui/request-form";
import { NotFoundError } from "@/shared/domain/errors";
import { addDays, localDateInIndia } from "@/shared/domain/local-date";
import { Page, PageHeader } from "@/shared/ui/layout";
import { requestBookingAction } from "../../../../_actions/bookings";

export const metadata: Metadata = { title: "Choose your dates" };
export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActorOrRedirect(`/outfits/${slug}/request`);
  const { search, bookings, clock } = container();
  const outfit = await search.outfit(actor, slug).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  if (outfit.status !== "ACTIVE" || outfit.owner.id === actor.userId) redirect(`/outfits/${slug}`);
  if (!actor.emailVerified || !actor.phoneVerified) redirect(`/outfits/${slug}`);

  const today = localDateInIndia(clock.now());
  return (
    <Page className="pb-16">
      <PageHeader
        eyebrow={<Link href={`/outfits/${slug}`}>← {outfit.title}</Link>}
        title={
          <>
            Choose your <span className="display-italic">dates</span>
          </>
        }
        lede="Pick a length and a start date. The owner has 24 hours to answer."
      />
      <div className="mt-10">
        <RequestForm
          outfitId={outfit.id}
          prices={outfit.prices}
          depositPaise={outfit.depositPaise}
          turnaroundDays={outfit.turnaroundDays}
          unavailable={await bookings.unavailableRanges(outfit.id)}
          earliestStart={addDays(today, marketplacePolicy.minLeadDays)}
          latestStart={addDays(today, marketplacePolicy.maxAdvanceDays)}
          action={requestBookingAction}
        />
      </div>
    </Page>
  );
}
