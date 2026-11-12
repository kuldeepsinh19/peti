import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { formatInr } from "@/shared/domain/money";
import { Notice } from "@/shared/ui/feedback";
import { DefinitionList, PageHeader, SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Administration" };

function Figure({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <>
      <span className="eyebrow text-graphite">{label}</span>
      <span className="font-display text-4xl numeral">{value}</span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex flex-col gap-2 border-t border-ink pt-3 no-underline hover:text-burgundy"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-2 border-t border-ink pt-3">{body}</div>
  );
}

export default async function AdminOverviewPage() {
  const actor = await requireAdminOrNotFound();
  const m = await container().admin.metrics(actor);
  const count = (record: Record<string, number>, ...keys: string[]) =>
    keys.reduce((t, k) => t + (record[k] ?? 0), 0);

  return (
    <div className="flex flex-col gap-14 pb-16">
      <PageHeader
        eyebrow="Administration"
        title="Overview"
        lede="Live figures from the database. Nothing here is estimated."
      />
      {m.reconciliationIssues > 0 ? (
        <Notice tone="danger" title={`${m.reconciliationIssues} booking(s) do not reconcile`}>
          For a closed booking, captured money must equal refunds plus payout plus commission. Investigate
          before paying out.
        </Notice>
      ) : (
        <Notice tone="success" title="Money reconciles">
          Every closed, paid booking balances: captured = refunded + payout + commission.
        </Notice>
      )}
      <section aria-labelledby="queue">
        <SectionIndex index={1}>Needs attention</SectionIndex>
        <h2 id="queue" className="sr-only">
          Needs attention
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-8 lg:grid-cols-4">
          <Figure
            label="Listings to review"
            value={count(m.listings, "PENDING_REVIEW")}
            href="/admin/listings"
          />
          <Figure label="Open disputes" value={m.openDisputes} href="/admin/disputes" />
          <Figure label="Payouts to send" value={m.pendingPayouts} href="/admin/payouts" />
          <Figure label="Refunds failed" value={m.failedRefunds} />
        </div>
      </section>
      <section aria-labelledby="marketplace" className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionIndex index={2}>Marketplace</SectionIndex>
          <h2 id="marketplace" className="sr-only">
            Marketplace
          </h2>
          <DefinitionList
            className="mt-4"
            items={[
              {
                term: "Members",
                value: `${m.users} (${m.verifiedUsers} with email and mobile verified, ${m.suspendedUsers} suspended)`,
              },
              { term: "Live listings", value: String(count(m.listings, "ACTIVE")) },
              { term: "Paused or in draft", value: String(count(m.listings, "PAUSED", "DRAFT")) },
              { term: "Requests waiting", value: String(count(m.bookings, "PENDING_APPROVAL")) },
              { term: "Awaiting payment", value: String(count(m.bookings, "AWAITING_PAYMENT")) },
              {
                term: "Confirmed or with renters",
                value: String(count(m.bookings, "CONFIRMED", "ACTIVE", "RETURNED")),
              },
              { term: "Completed rentals", value: String(count(m.bookings, "COMPLETED")) },
            ]}
          />
        </div>
        <div>
          <SectionIndex index={3}>Money</SectionIndex>
          <DefinitionList
            className="mt-4"
            items={[
              { term: "Rental fees on completed rentals", value: formatInr(m.completedRentalFeePaise) },
              { term: "Commission earned", value: formatInr(m.commissionEarnedPaise) },
              { term: "Owed to owners", value: formatInr(m.pendingPayoutsPaise) },
              { term: "Refunds in progress", value: String(m.pendingRefunds) },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
