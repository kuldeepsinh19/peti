import { marketplacePolicy } from "@/config/marketplace-policy";
import { formatInr } from "@/shared/domain/money";
import { DefinitionList } from "@/shared/ui/layout";

const hours = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);

/**
 * The rules a renter agrees to, from the same policy values the booking and settlement code applies (and
 * snapshots onto every booking), so the page can never promise something the code does not do.
 */
export function RentalPolicies({
  depositPaise,
  turnaroundDays,
}: {
  depositPaise: number;
  turnaroundDays: number;
}) {
  const p = marketplacePolicy;
  const tiers = p.renterCancellationTiers;
  const full = tiers.find((t) => t.feeRefundBps === 10_000);
  const half = tiers.find((t) => t.feeRefundBps > 0 && t.feeRefundBps < 10_000);
  const cancellation = [
    full ? `full refund of the rental fee ${hours(full.minHoursBeforeStart)} or more before the start` : null,
    half
      ? `${half.feeRefundBps / 100}% between ${hours(half.minHoursBeforeStart)} and ${full ? hours(full.minHoursBeforeStart) : "the start"}`
      : null,
    `no refund of the fee within ${hours(half?.minHoursBeforeStart ?? 0)}`,
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <section aria-labelledby="policies">
      <h2 id="policies" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
        How renting works
      </h2>
      <DefinitionList
        className="border-t-0"
        items={[
          {
            term: "Requests",
            value: `The owner answers within ${p.approvalWindowHours} hours. You pay only after they approve, within ${p.paymentWindowHours} hours.`,
          },
          {
            term: "Deposit",
            value: `${formatInr(depositPaise)}, refunded after the outfit comes back as it went out (the owner has ${hours(p.inspectionWindowHours)} to check it).`,
          },
          { term: "Cancelling", value: `Your deposit is always refunded; ${cancellation}.` },
          {
            term: "Returning late",
            value: `Each late day costs one and a half times the daily rental rate, taken from the deposit.`,
          },
          {
            term: "Cleaning",
            value: `The owner keeps ${turnaroundDays} day${turnaroundDays === 1 ? "" : "s"} after each rental to clean it.`,
          },
        ]}
      />
    </section>
  );
}
