import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { type OwnerListingRow, outfitStatusLabel } from "@/modules/listings";
import { outfitStatusExplanation, outfitStatusTone } from "@/modules/listings/ui/status";
import { fileUrl } from "@/modules/media";
import { formatLocalDate, type LocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { ButtonLink } from "@/shared/ui/button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { StatusButton } from "../status-button";
import { signedError } from "@/app/_lib/flash";

export const metadata: Metadata = { title: "My outfits" };

const DONE: Record<string, { title: string; body?: string }> = {
  submitted: {
    title: "Submitted for review",
    body: "A Peti administrator checks every listing before renters can see it. You will get a notification when it is published.",
  },
  withdrawn: { title: "Withdrawn from review", body: "It is a draft again; submit it when you are ready." },
  paused: { title: "Paused", body: "Renters cannot find it now. Bookings already made go ahead." },
  resumed: { title: "Published again", body: "Renters can find and request it." },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Activity({ row }: { row: OwnerListingRow }) {
  const parts: ReactNode[] = [];
  if (row.pendingRequests > 0) {
    parts.push(
      <Link key="req" href="/lend/requests" className="text-burgundy">
        {plural(row.pendingRequests, "request")} waiting for your answer
      </Link>,
    );
  }
  if (row.upcomingRentals > 0) {
    parts.push(
      <span key="up">
        {plural(row.upcomingRentals, "upcoming rental")}
        {row.nextRentalStart ? `, next from ${formatLocalDate(row.nextRentalStart as LocalDate)}` : ""}
      </span>,
    );
  }
  if (parts.length === 0) return <p className="text-sm text-stone">No bookings yet.</p>;
  return <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{parts}</p>;
}

function Actions({ row }: { row: OwnerListingRow }) {
  const s = row.status;
  const back = "/lend/dashboard";
  const link = (href: string, label: string) => (
    <Link href={href} className="text-sm">
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {s === "DRAFT" || s === "REJECTED" ? (
        row.photoCount >= marketplacePolicy.minListingPhotos ? (
          <ButtonLink href={`/lend/outfits/${row.id}/preview`} size="sm">
            Preview and submit
          </ButtonLink>
        ) : (
          <ButtonLink href={`/lend/outfits/${row.id}/photos`} size="sm">
            Add photographs
          </ButtonLink>
        )
      ) : null}
      {s === "PENDING_REVIEW" ? (
        <StatusButton
          outfitId={row.id}
          command="withdrawFromReview"
          label="Withdraw"
          size="sm"
          returnTo={back}
        />
      ) : null}
      {s === "ACTIVE" ? (
        <StatusButton outfitId={row.id} command="pause" label="Pause" size="sm" returnTo={back} />
      ) : null}
      {s === "PAUSED" ? (
        <StatusButton
          outfitId={row.id}
          command="resume"
          label="Resume"
          variant="primary"
          size="sm"
          returnTo={back}
        />
      ) : null}
      {s === "ACTIVE" || s === "PAUSED" ? link(`/outfits/${row.slug}`, "View listing") : null}
      {s !== "SUSPENDED" ? link(`/lend/outfits/${row.id}/edit`, "Edit") : null}
      {s !== "SUSPENDED" ? link(`/lend/outfits/${row.id}/photos`, "Photographs") : null}
      {s === "ACTIVE" || s === "PAUSED" ? link(`/lend/outfits/${row.id}/calendar`, "Availability") : null}
      {row.openBookings > 0 ? link("/lend/requests", "Rental requests") : null}
    </div>
  );
}

export default async function MyOutfitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/lend/dashboard");
  const query = await searchParams;
  const rows = await container().listings.listMine(actor);
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  const count = (status: OwnerListingRow["status"]) => rows.filter((r) => r.status === status).length;
  const waiting = rows.reduce((n, r) => n + r.pendingRequests, 0);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Lending"
        title={
          <>
            My <span className="display-italic">outfits</span>
          </>
        }
        lede={
          rows.length
            ? `${plural(count("ACTIVE"), "published outfit")} · ${count("PENDING_REVIEW")} pending approval · ${plural(waiting, "request")} waiting`
            : undefined
        }
        actions={<ButtonLink href="/lend/outfits/new">List an outfit</ButtonLink>}
      />

      <div className="mt-8 flex flex-col gap-4">
        {done ? (
          <Notice tone="success" title={done.title}>
            {done.body}
          </Notice>
        ) : null}
        {signedError(query) ? (
          <Notice tone="danger" title="That did not work">
            {signedError(query)}
          </Notice>
        ) : null}
        {!actor.phoneVerified || !actor.emailVerified ? (
          <Notice tone="warning" title="Verify your contact details">
            You can prepare listings now, but you need a confirmed email and mobile number to submit them for
            review. <Link href="/account">Go to Profile &amp; settings</Link>.
          </Notice>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <section className="mt-16 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="eyebrow text-brass-deep">Your wardrobe, earning</p>
            <h2 className="mt-3 text-display-md">
              That sherwani you wore <span className="display-italic">once</span>
            </h2>
            <p className="mt-4 max-w-prose text-lg text-graphite">
              List it in three steps: the details, a few photographs, and a preview of exactly what renters
              will see. A Peti administrator checks it before it goes live.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/lend/outfits/new" size="lg">
                List your first outfit
              </ButtonLink>
              <ButtonLink href="/lend" variant="quiet" size="lg">
                How lending works
              </ButtonLink>
            </div>
          </div>
        </section>
      ) : (
        <ul aria-label="My outfits" className="mt-10 border-t border-ink">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[6rem_1fr] gap-5 border-b border-rule py-6 sm:grid-cols-[8rem_1fr] sm:gap-8"
            >
              <Link
                href={`/lend/outfits/${row.id}/preview`}
                className="relative block aspect-[3/4] overflow-hidden bg-sand"
                aria-label={`Preview ${row.title}`}
              >
                {row.photoKey ? (
                  <Image src={fileUrl(row.photoKey)} alt="" fill sizes="128px" className="object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center p-2 text-center eyebrow text-graphite">
                    No photograph
                  </span>
                )}
              </Link>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <p className="eyebrow text-graphite">{row.categoryName}</p>
                    <h2 className="mt-1 font-display text-2xl leading-tight">{row.title}</h2>
                  </div>
                  <p className="text-right numeral">
                    {row.minPricePaise ? (
                      <>
                        <span className="font-display text-2xl">{formatInr(row.minPricePaise)}</span>
                        {row.minPriceDays ? (
                          <span className="block text-caption text-graphite">
                            for {row.minPriceDays} days
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sm text-stone">No price yet</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p>
                    <Tag tone={outfitStatusTone[row.status]}>{outfitStatusLabel[row.status]}</Tag>
                  </p>
                  <p className="text-sm text-graphite">{outfitStatusExplanation[row.status]}</p>
                  {row.status === "REJECTED" && row.moderationNote ? (
                    <p className="text-sm text-danger">Reviewer: {row.moderationNote}</p>
                  ) : null}
                </div>
                <Activity row={row} />
                <Actions row={row} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
