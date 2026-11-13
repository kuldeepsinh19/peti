import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState, Notice } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { runAction } from "../../_lib/action";

export const metadata: Metadata = { title: "Notifications" };
const instant = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

async function markAllReadAction() {
  "use server";
  const result = await runAction("markAllRead", (actor) => container().inbox.markAllRead(actor));
  revalidatePath("/account/notifications");
  if (!result.ok) redirect(`/account/notifications?error=${encodeURIComponent(result.error.message)}`);
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/account/notifications");
  const { error } = await searchParams;
  const items = await container().inbox.list(actor);
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={unread ? unread + " unread" : "All read"}
        title="Notifications"
        actions={
          unread ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="quiet">Mark all as read</SubmitButton>
            </form>
          ) : null
        }
      />
      {typeof error === "string" ? (
        <Notice tone="danger" title="That did not work" className="mt-8">
          {error}
        </Notice>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title="Nothing yet." className="mt-10">
          Updates about your rentals and listings appear here.
        </EmptyState>
      ) : (
        <ol className="mt-10 border-t border-ink">
          {items.map((n) => (
            <li
              key={n.id}
              className={
                "grid gap-1 border-b border-rule py-4 " + (n.read ? "" : "border-l-2 border-l-burgundy pl-3")
              }
            >
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-display text-lg">
                  {n.link ? <Link href={n.link}>{n.subject}</Link> : n.subject}
                </span>
                <span className="text-caption text-stone numeral">{instant.format(n.createdAt)}</span>
              </p>
              <p className="text-sm text-graphite">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
