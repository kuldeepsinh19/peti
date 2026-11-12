import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { EmptyState } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

export const metadata: Metadata = { title: "Activity" };
const instant = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function AdminActivityPage() {
  const actor = await requireAdminOrNotFound();
  const rows = await container().admin.activity(actor);
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader
        eyebrow="Administration"
        title="Activity"
        lede="The audit log: every administrative decision, suspension and payout. Append-only — the database rejects edits and deletions."
      />
      <Ledger
        caption="Audit log"
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty={<EmptyState title="Nothing recorded yet." />}
        columns={[
          { key: "when", header: "When", cell: (r) => instant.format(r.createdAt) },
          { key: "who", header: "Who", cell: (r) => r.actorName ?? r.actorRole.toLowerCase() },
          { key: "what", header: "Action", cell: (r) => <span className="numeral">{r.action}</span> },
          { key: "on", header: "On", cell: (r) => r.entityType + " " + r.entityId.slice(0, 8) },
          { key: "why", header: "Reason", cell: (r) => r.reason ?? "—" },
        ]}
      />
    </div>
  );
}
