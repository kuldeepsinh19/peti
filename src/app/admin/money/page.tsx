import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import type { MoneyHealthCounts } from "@/modules/admin";
import { formatInr } from "@/shared/domain/money";
import { Notice, Tag } from "@/shared/ui/feedback";
import { DefinitionList, PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

export const metadata: Metadata = { title: "Money" };
export const dynamic = "force-dynamic";

const instant = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const CHECKS: ReadonlyArray<{ key: keyof MoneyHealthCounts; label: string; action: string }> = [
  {
    key: "reconciliationImbalances",
    label: "Closed bookings whose money does not add up",
    action: "Must always be 0. Investigate before any further payout.",
  },
  {
    key: "unexpectedCapturesOutstanding",
    label: "Stray captures not yet refunded",
    action: "The refund is queued; if it failed, retry it from Payouts.",
  },
  {
    key: "authorizationsWaiting",
    label: "Authorised payments not captured",
    action: "The sweep retries every 15 minutes. Check the provider status and the last error below.",
  },
  {
    key: "refundsFailed",
    label: "Refunds the provider refused",
    action: "Fix the cause with the provider, then retry from Payouts.",
  },
  {
    key: "refundsNotSent",
    label: "Refunds queued for more than 2 hours",
    action: "The background sweep is not running. Check the scheduler.",
  },
  {
    key: "refundsStuck",
    label: "Refunds pending at the provider for more than 10 days",
    action: "Ask the provider about them.",
  },
  {
    key: "chargebacksOpen",
    label: "Open chargebacks",
    action: "Answer them in the provider dashboard before the deadline. The owner's payout waits.",
  },
  {
    key: "payoutsFailed",
    label: "Payouts that came back",
    action: "Confirm the owner's UPI ID, then send again from Payouts.",
  },
  {
    key: "providerEventsFailed",
    label: "Webhooks that failed in the last 7 days",
    action: "Reconciliation covers payments and refunds; read the errors below for anything else.",
  },
  {
    key: "chargebacksLostRecently",
    label: "Chargebacks lost in the last 30 days",
    action: "For information: that money went back to the payer.",
  },
];

const bookingLink = (bookingId: string | null, reference: string | null) =>
  bookingId ? (
    <Link href={"/admin/bookings/" + bookingId} className="numeral">
      {reference}
    </Link>
  ) : (
    "Not matched to a booking"
  );

export default async function AdminMoneyPage() {
  const actor = await requireAdminOrNotFound();
  const health = await container().money.health(actor);
  const { lists } = health;
  return (
    <div className="flex flex-col gap-10 pb-16">
      <PageHeader
        eyebrow="Administration"
        title="Money"
        lede="What needs attention in payments, refunds, payouts and chargebacks. Every figure should be zero. The same figures are served to the monitoring endpoint."
      />
      {health.ok ? (
        <Notice tone="success" title="Nothing needs attention" />
      ) : (
        <Notice tone="danger" title="Something needs attention">
          {health.attention.length} check{health.attention.length === 1 ? "" : "s"} below{" "}
          {health.attention.length === 1 ? "is" : "are"} not zero.
        </Notice>
      )}
      <DefinitionList
        items={CHECKS.map((c) => ({
          term: c.label,
          value: (
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-3">
                <strong className="numeral">{health.counts[c.key]}</strong>
                {health.attention.includes(c.key) ? <Tag tone="danger">Needs attention</Tag> : null}
              </span>
              {health.counts[c.key] > 0 ? <span className="text-graphite">{c.action}</span> : null}
            </span>
          ),
        }))}
      />

      {lists.unexpectedCaptures.length ? (
        <section aria-labelledby="stray" className="flex flex-col gap-4">
          <h2 id="stray" className="font-display text-2xl">
            Stray captures being refunded
          </h2>
          <Ledger
            caption="Stray captures"
            rows={lists.unexpectedCaptures}
            rowKey={(r) => r.refundId}
            columns={[
              { key: "ref", header: "Booking", cell: (r) => bookingLink(r.bookingId, r.reference) },
              { key: "amount", header: "Amount", align: "right", cell: (r) => formatInr(r.amountPaise) },
              { key: "status", header: "Refund", cell: (r) => r.status.toLowerCase() },
              { key: "error", header: "Last error", cell: (r) => r.lastError ?? "—" },
              { key: "when", header: "Found", cell: (r) => instant.format(r.createdAt) },
            ]}
          />
        </section>
      ) : null}

      {lists.authorizations.length ? (
        <section aria-labelledby="authorised" className="flex flex-col gap-4">
          <h2 id="authorised" className="font-display text-2xl">
            Authorised payments being captured
          </h2>
          <Ledger
            caption="Authorised payments"
            rows={lists.authorizations}
            rowKey={(r) => r.bookingId}
            columns={[
              { key: "ref", header: "Booking", cell: (r) => bookingLink(r.bookingId, r.reference) },
              { key: "amount", header: "Amount", align: "right", cell: (r) => formatInr(r.amountPaise) },
              { key: "tries", header: "Failed attempts", align: "right", cell: (r) => r.captureAttempts },
              { key: "error", header: "Last error", cell: (r) => r.lastCaptureError ?? "—" },
              { key: "when", header: "Since", cell: (r) => instant.format(r.updatedAt) },
            ]}
          />
        </section>
      ) : null}

      {lists.chargebacks.length ? (
        <section aria-labelledby="chargebacks" className="flex flex-col gap-4">
          <h2 id="chargebacks" className="font-display text-2xl">
            Open chargebacks
          </h2>
          <Ledger
            caption="Open chargebacks"
            rows={lists.chargebacks}
            rowKey={(r) => r.id}
            columns={[
              { key: "ref", header: "Booking", cell: (r) => bookingLink(r.bookingId, r.reference) },
              { key: "amount", header: "Amount", align: "right", cell: (r) => formatInr(r.amountPaise) },
              { key: "reason", header: "Reason", cell: (r) => r.reasonCode ?? "—" },
              { key: "when", header: "Opened", cell: (r) => instant.format(r.createdAt) },
            ]}
          />
        </section>
      ) : null}

      {lists.failedEvents.length ? (
        <section aria-labelledby="events" className="flex flex-col gap-4">
          <h2 id="events" className="font-display text-2xl">
            Webhooks that failed
          </h2>
          <Ledger
            caption="Failed webhooks"
            rows={lists.failedEvents}
            rowKey={(r) => String(r.id)}
            columns={[
              { key: "type", header: "Event", cell: (r) => <span className="numeral">{r.eventType}</span> },
              { key: "error", header: "Error", cell: (r) => r.lastError ?? "—" },
              { key: "when", header: "Received", cell: (r) => instant.format(r.receivedAt) },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
