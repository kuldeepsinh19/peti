import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { outfitStatusLabel, type ModerationRow, type OutfitStatus } from "@/modules/listings";
import { outfitStatusTone } from "@/modules/listings/ui/status";
import { fileUrl } from "@/modules/media";
import { formatInr } from "@/shared/domain/money";
import { Button } from "@/shared/ui/button";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { moderateListingAction } from "../actions";

export const metadata: Metadata = { title: "Listing moderation" };

const VIEWS: Record<string, { label: string; statuses: OutfitStatus[] }> = {
  review: { label: "Awaiting review", statuses: ["PENDING_REVIEW"] },
  live: { label: "Live and paused", statuses: ["ACTIVE", "PAUSED"] },
  suspended: { label: "Suspended", statuses: ["SUSPENDED"] },
  rejected: { label: "Changes requested", statuses: ["REJECTED"] },
};

function ModerationForm({
  row,
  command,
  label,
  needsNote,
}: {
  row: ModerationRow;
  command: string;
  label: string;
  needsNote?: boolean;
}) {
  return (
    <form action={moderateListingAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="outfitId" value={row.id} />
      <input type="hidden" name="command" value={command} />
      {needsNote ? (
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="eyebrow text-graphite">Reason (shown to the owner)</span>
          <input
            name="note"
            required
            maxLength={500}
            className="border-0 border-b border-rule-strong bg-transparent py-1 text-sm focus:border-ink focus:outline-none"
          />
        </label>
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant={command === "approve" ? "primary" : command === "reinstate" ? "secondary" : "danger"}
      >
        {label}
      </Button>
    </form>
  );
}

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminOrNotFound();
  const params = await searchParams;
  const viewKey = typeof params.view === "string" && params.view in VIEWS ? params.view : "review";
  const view = VIEWS[viewKey]!;
  const rows = await container().listings.listForModeration(actor, view.statuses);

  return (
    <div className="pb-16">
      <PageHeader eyebrow="Moderation" title="Listings" />
      <nav aria-label="Listing views" className="mt-6 flex flex-wrap gap-6 text-sm">
        {Object.entries(VIEWS).map(([key, v]) => (
          <Link
            key={key}
            href={`/admin/listings?view=${key}`}
            aria-current={key === viewKey ? "page" : undefined}
            className={key === viewKey ? "text-ink" : "text-graphite"}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 flex flex-col gap-3">
        {typeof params.error === "string" ? (
          <Notice tone="danger" title="Not done">
            {params.error}
          </Notice>
        ) : null}
        {typeof params.done === "string" ? <Notice tone="success" title="Recorded in the audit log" /> : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here." className="mt-8" />
      ) : (
        <ul className="mt-8 border-t border-ink">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-6 border-b border-rule py-6 md:grid-cols-[6rem_1fr]">
              <div className="relative aspect-[3/4] w-24 overflow-hidden bg-sand">
                {r.photoKey ? (
                  <Image src={fileUrl(r.photoKey)} alt="" fill sizes="96px" className="object-cover" />
                ) : null}
              </div>
              <div className="flex flex-col gap-3">
                <p className="flex flex-wrap items-center gap-3">
                  <Link href={`/outfits/${r.slug}`} className="font-display text-2xl">
                    {r.title}
                  </Link>
                  <Tag tone={outfitStatusTone[r.status]}>{outfitStatusLabel[r.status]}</Tag>
                </p>
                <p className="text-sm text-graphite">
                  {r.categoryName} · {r.localityName} · by {r.ownerName} · {r.photoCount} photo
                  {r.photoCount === 1 ? "" : "s"} · from {r.minPricePaise ? formatInr(r.minPricePaise) : "—"}{" "}
                  · deposit {formatInr(r.depositPaise)} of {formatInr(r.retailValuePaise)} retail
                </p>
                {r.moderationNote ? (
                  <p className="text-sm text-graphite">Last note: {r.moderationNote}</p>
                ) : null}
                <div className="flex flex-col gap-4">
                  {r.status === "PENDING_REVIEW" ? (
                    <>
                      <ModerationForm row={r} command="approve" label="Approve and publish" />
                      <ModerationForm row={r} command="reject" label="Request changes" needsNote />
                    </>
                  ) : null}
                  {r.status === "ACTIVE" || r.status === "PAUSED" || r.status === "PENDING_REVIEW" ? (
                    <ModerationForm row={r} command="suspend" label="Suspend" needsNote />
                  ) : null}
                  {r.status === "SUSPENDED" ? (
                    <ModerationForm row={r} command="reinstate" label="Reinstate (as paused)" />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
