import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { formatInr } from "@/shared/domain/money";
import { SubmitButton } from "@/shared/ui/submit-button";
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
  const admin = container().admin;
  const [rows, failed] = await Promise.all([
    showPaid
      ? admin.payouts(actor, "PAID")
      : // Payouts that came back are sent again, so they wait with the pending ones.
        Promise.all([admin.payouts(actor, "FAILED"), admin.payouts(actor, "PENDING")]).then((r) => r.flat()),
    admin.failedRefunds(actor),
  ]);
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
      {params.done === "markPayoutPaid" ? <Notice tone="success" title="Payout recorded as paid" /> : null}
      {params.done === "recordPayoutFailure" ? (
        <Notice tone="success" title="Payout recorded as failed">
          It is back under &ldquo;To pay&rdquo;, to be sent again once the cause is fixed.
        </Notice>
      ) : null}
      {params.done === "retryRefund" ? (
        <Notice tone="success" title="Refund queued again">
          The next sweep sends it to the payment provider.
        </Notice>
      ) : null}
      {failed.length ? (
        <section aria-labelledby="failed-refunds" className="flex flex-col gap-4">
          <h2 id="failed-refunds" className="font-display text-2xl">
            Refunds that failed
          </h2>
          <p className="max-w-2xl text-sm text-graphite">
            The provider rejected these refunds after several attempts. Check the error, fix the cause with
            the provider if needed, then queue the refund again. Each retry is audit-logged.
          </p>
          <Ledger
            caption="Failed refunds"
            rows={failed}
            rowKey={(r) => r.id}
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
              { key: "amount", header: "Amount", align: "right", cell: (r) => formatInr(r.amountPaise) },
              { key: "attempts", header: "Attempts", align: "right", cell: (r) => r.attempts },
              { key: "error", header: "Last error", cell: (r) => r.lastError ?? "—" },
              {
                key: "act",
                header: "Action",
                cell: (r) => (
                  <form action={adminCommandAction}>
                    <input type="hidden" name="command" value="retryRefund" />
                    <input type="hidden" name="refundId" value={r.id} />
                    <SubmitButton size="sm" variant="secondary">
                      Retry refund
                    </SubmitButton>
                  </form>
                ),
              },
            ]}
          />
        </section>
      ) : null}
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
          {
            key: "state",
            header: "Status",
            cell: (r) =>
              r.onHold ? (
                <Tag tone="warning">On hold: chargeback open</Tag>
              ) : r.status === "FAILED" ? (
                <span className="flex flex-col gap-1">
                  <Tag tone="danger">Failed</Tag>
                  <span className="text-sm text-graphite">{r.failureReason}</span>
                </span>
              ) : (
                <Tag>{r.status === "PAID" ? "Paid" : "Pending"}</Tag>
              ),
          },
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
                <span className="flex flex-col gap-2">
                  <span className="numeral">{r.payoutReference}</span>
                  <form action={adminCommandAction} className="flex items-end gap-2">
                    <input type="hidden" name="command" value="recordPayoutFailure" />
                    <input type="hidden" name="payoutId" value={r.id} />
                    <input
                      name="reason"
                      required
                      minLength={5}
                      placeholder="What came back, and why"
                      aria-label={"Failure reason for " + r.reference}
                      className={field}
                    />
                    <SubmitButton size="sm" variant="secondary">
                      Record failure
                    </SubmitButton>
                  </form>
                </span>
              ) : r.onHold ? (
                <span className="text-sm text-graphite">Waits until the chargeback is resolved</span>
              ) : !r.upiVpa ? (
                <span className="text-sm text-graphite">Waiting for the owner&rsquo;s UPI ID</span>
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
                  <SubmitButton size="sm">Mark paid</SubmitButton>
                </form>
              ),
          },
        ]}
      />
    </div>
  );
}
