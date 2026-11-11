import type { Metadata } from "next";
import { container } from "@/composition/container";
import { EmptyState } from "@/shared/ui/feedback";
import { Page, PageHeader } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Dev outbox", robots: { index: false } };

const time = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** Emails and SMS captured by the outbox adapters in local/test environments (the layout 404s elsewhere). */
export default async function DevOutboxPage() {
  const messages = await container().db.devOutboxMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <Page className="pb-16">
      <PageHeader
        eyebrow="Development"
        title="Outbox"
        lede="Verification links, password resets, one-time codes and notifications that would have been sent."
      />
      {messages.length === 0 ? (
        <EmptyState title="Nothing sent yet." className="mt-10" />
      ) : (
        <ol className="mt-10 border-t border-ink">
          {messages.map((m) => (
            <li key={m.id} className="border-b border-rule py-5" data-testid="outbox-message">
              <p className="flex flex-wrap gap-3 eyebrow text-graphite">
                <span>{m.channel}</span>
                <span data-testid="outbox-recipient">{m.recipient}</span>
                <span>{time.format(m.createdAt)}</span>
              </p>
              {m.subject ? <p className="mt-2 font-display text-xl">{m.subject}</p> : null}
              <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-ink" data-testid="outbox-body">
                {m.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} className="break-all text-burgundy">
                      {part}
                    </a>
                  ) : (
                    part
                  ),
                )}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}
