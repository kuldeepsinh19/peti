import { container } from "@/composition/container";
import type { UserActor } from "@/shared/application/actor";
import { formatInr } from "@/shared/domain/money";
import { Tag } from "@/shared/ui/feedback";
import { DefinitionList } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

const instant = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** Fields worth showing from an audit entry; anything else stays in the audit log itself. */
const SHOWN = [
  "reason",
  "status",
  "amountPaise",
  "netPaise",
  "reference",
  "providerPaymentId",
  "providerRefundId",
  "reasonCode",
  "source",
] as const;

function describe(detail: Record<string, unknown> | null): string {
  if (!detail) return "—";
  const parts = SHOWN.filter((key) => detail[key] !== undefined && detail[key] !== null).map((key) => {
    const value = detail[key];
    return key.endsWith("Paise") && typeof value === "number"
      ? `${key.replace("Paise", "")} ${formatInr(value)}`
      : `${key} ${String(value)}`;
  });
  return parts.length ? parts.join(" · ") : "—";
}

/** Administrators only: every money event recorded for one booking, oldest first (ADR-006). */
export async function MoneyTimeline({ actor, bookingId }: { actor: UserActor; bookingId: string }) {
  const { payment, chargebacks, events } = await container().money.timeline(actor, bookingId);
  if (!payment && events.length === 0) return null;
  return (
    <section aria-labelledby="money-timeline" className="flex flex-col gap-6 pb-16">
      <h2 id="money-timeline" className="font-display text-3xl">
        Money timeline
      </h2>
      {payment ? (
        <DefinitionList
          items={[
            { term: "Payment", value: `${payment.status.toLowerCase()} (${payment.provider})` },
            { term: "Amount", value: formatInr(payment.amountPaise) },
            { term: "Refunded", value: formatInr(payment.refundedPaise) },
            ...(payment.captureAttempts
              ? [
                  {
                    term: "Failed capture attempts",
                    value: `${payment.captureAttempts} · ${payment.lastCaptureError ?? "no error recorded"}`,
                  },
                ]
              : []),
            {
              term: "Last checked with the provider",
              value: payment.lastReconciledAt ? instant.format(payment.lastReconciledAt) : "Not yet",
            },
            ...chargebacks.map((c) => ({
              term: "Chargeback",
              value: (
                <span className="flex flex-wrap items-center gap-2">
                  <Tag tone={c.status === "OPEN" ? "danger" : "neutral"}>{c.status.toLowerCase()}</Tag>
                  {formatInr(c.amountPaise)} · {c.reasonCode ?? "no reason given"} · {instant.format(c.at)}
                </span>
              ),
            })),
          ]}
        />
      ) : null}
      <Ledger
        caption="Money events"
        rows={events}
        rowKey={(e) => String(e.id)}
        columns={[
          { key: "when", header: "When", cell: (e) => instant.format(e.at) },
          { key: "what", header: "Event", cell: (e) => <span className="numeral">{e.action}</span> },
          { key: "who", header: "By", cell: (e) => e.actorRole.toLowerCase() },
          { key: "detail", header: "Detail", cell: (e) => describe(e.detail) },
          { key: "why", header: "Note", cell: (e) => e.reason ?? "—" },
        ]}
      />
    </section>
  );
}
