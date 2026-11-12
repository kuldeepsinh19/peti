import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { formatInr } from "@/shared/domain/money";
import { Button } from "@/shared/ui/button";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";
import { adminCommandAction } from "../actions";

export const metadata: Metadata = { title: "Payouts" };
const field =
  "border-0 border-b border-rule-strong bg-transparent py-1 text-sm focus:border-ink focus:outline-none";

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminOrNotFound();
  const params = await searchParams;
  const showPaid = params.view === "paid";
  const rows = await container().admin.payouts(actor, showPaid ? "PAID" : "PENDING");
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader
        eyebrow="Administration"
        title="Payouts"
        lede="Send each payout by UPI outside Peti, then record the reference here. Recording is audit-logged and cannot be undone from the interface."
      />
      {typeof params.error === "string" ? (
        <Notice tone="danger" title="Not recorded">
          {params.error}
        </Notice>
      ) : null}
      {params.done === "1" ? <Notice tone="success" title="Payout recorded as paid" /> : null}
      <nav className="flex gap-6 text-sm">
        <Link href="/admin/payouts" className={showPaid ? "text-graphite" : "text-ink"}>
          To pay
        </Link>
        <Link href="/admin/payouts?view=paid" className={showPaid ? "text-ink" : "text-graphite"}>
          Paid
        </Link>
      </nav>
      <Ledger
        caption="Payouts"
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title={showPaid ? "No payouts recorded yet." : "Nothing to pay."} />}
        columns={[
          {
            key: "ref",
            header: "Booking",
            cell: (r) => (
              <Link href={"/admin/bookings/" + r.bookingId} className="numeral">
                {r.reference}
              </Link>
            ),
          },
          { key: "owner", header: "Owner", cell: (r) => r.ownerName },
          { key: "upi", header: "UPI ID", cell: (r) => r.upiVpa ?? <Tag tone="warning">Not provided</Tag> },
          {
            key: "net",
            header: "Amount",
            align: "right",
            cell: (r) => <strong>{formatInr(r.netPaise)}</strong>,
          },
          {
            key: "act",
            header: showPaid ? "Reference" : "Record payment",
            cell: (r) =>
              r.status === "PAID" ? (
                <span className="numeral">{r.payoutReference}</span>
              ) : (
                <form action={adminCommandAction} className="flex items-end gap-2">
                  <input type="hidden" name="command" value="markPayoutPaid" />
                  <input type="hidden" name="payoutId" value={r.id} />
                  <input
                    name="reference"
                    required
                    minLength={4}
                    placeholder="UTR / reference"
                    aria-label={"Reference for " + r.reference}
                    className={field}
                  />
                  <Button type="submit" size="sm">
                    Mark paid
                  </Button>
                </form>
              ),
          },
        ]}
      />
    </div>
  );
}
