import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { formatInr } from "@/shared/domain/money";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { DefinitionList, PageHeader, SectionIndex } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";
import { savePayoutAccountAction } from "../actions";

export const metadata: Metadata = { title: "Earnings" };

const day = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const field = "border-0 border-b border-rule-strong bg-transparent py-2 focus:border-ink focus:outline-none";

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/lend/earnings");
  const { bookings, users } = container();
  const [payouts, account] = await Promise.all([bookings.myPayouts(actor), users.getAccount(actor)]);
  const params = await searchParams;
  const sum = (status: string) =>
    payouts.filter((p) => p.status === status).reduce((t, p) => t + p.netPaise, 0);

  return (
    <div className="flex flex-col gap-14 pb-16">
      <PageHeader
        eyebrow="Lending"
        title="Earnings"
        lede="Payouts are created when a rental completes. In this early release an administrator pays them by UPI and records the reference here."
      />
      {typeof params.error === "string" ? (
        <Notice tone="danger" title="Not saved">
          {params.error}
        </Notice>
      ) : null}
      {params.saved === "1" ? <Notice tone="success" title="Payout details saved" /> : null}

      <section aria-labelledby="totals" className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionIndex index={1}>Totals</SectionIndex>
          <h2 id="totals" className="sr-only">
            Totals
          </h2>
          <DefinitionList
            className="mt-4"
            items={[
              {
                term: "Paid to you",
                value: <span className="font-display text-2xl numeral">{formatInr(sum("PAID"))}</span>,
              },
              {
                term: "Waiting to be paid",
                value: <span className="numeral">{formatInr(sum("PENDING"))}</span>,
              },
              { term: "Completed rentals", value: String(payouts.length) },
            ]}
          />
        </div>
        <form action={savePayoutAccountAction} className="flex flex-col gap-5 lg:col-span-5 lg:col-start-8">
          <SectionIndex index={2}>Where we pay you</SectionIndex>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">UPI ID</span>
            <input
              name="upiVpa"
              required
              defaultValue={account.payoutAccount?.upiVpa ?? ""}
              placeholder="name@bank"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Account holder name</span>
            <input
              name="accountHolderName"
              required
              defaultValue={account.payoutAccount?.accountHolderName ?? ""}
              className={field}
            />
          </label>
          <div>
            <button
              type="submit"
              className="h-11 border border-ink px-6 text-sm hover:bg-ink hover:text-paper"
            >
              Save payout details
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="payouts">
        <SectionIndex index={3}>Payouts</SectionIndex>
        <h2 id="payouts" className="sr-only">
          Payouts
        </h2>
        <div className="mt-4">
          <Ledger
            caption="Payouts"
            rows={payouts}
            rowKey={(p) => p.bookingId}
            empty={<EmptyState title="No payouts yet.">They appear here when a rental completes.</EmptyState>}
            columns={[
              {
                key: "booking",
                header: "Rental",
                cell: (p) => (
                  <Link href={"/lend/requests/" + p.bookingId}>
                    {p.outfitTitle} <span className="text-stone numeral">{p.reference}</span>
                  </Link>
                ),
              },
              {
                key: "fee",
                header: "Rental fee kept",
                align: "right",
                cell: (p) => formatInr(p.grossRentalPaise),
              },
              {
                key: "commission",
                header: "Commission",
                align: "right",
                cell: (p) => "− " + formatInr(p.commissionPaise),
              },
              {
                key: "deposit",
                header: "From deposit",
                align: "right",
                cell: (p) => formatInr(p.depositWithheldPaise),
              },
              {
                key: "net",
                header: "You receive",
                align: "right",
                cell: (p) => <strong>{formatInr(p.netPaise)}</strong>,
              },
              {
                key: "status",
                header: "Status",
                cell: (p) =>
                  p.status === "PAID" ? (
                    <Tag tone="success">Paid {p.paidAt ? day.format(p.paidAt) : ""}</Tag>
                  ) : (
                    <Tag tone="warning">{p.status.toLowerCase()}</Tag>
                  ),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
