import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { SubmitButton } from "@/shared/ui/submit-button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";
import { adminCommandAction } from "../actions";

export const metadata: Metadata = { title: "Users" };
const day = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const field =
  "border-0 border-b border-rule-strong bg-transparent py-1 text-sm focus:border-ink focus:outline-none";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminOrNotFound();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const users = await container().admin.users(actor, q);
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader eyebrow="Administration" title="Users" />
      {typeof params.error === "string" ? (
        <Notice tone="danger" title="Not done">
          {params.error}
        </Notice>
      ) : null}
      {typeof params.done === "string" ? <Notice tone="success" title="Recorded in the audit log" /> : null}
      <form className="flex max-w-md items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="eyebrow text-graphite">Search name or email</span>
          <input name="q" defaultValue={q ?? ""} className={field} />
        </label>
        <SubmitButton size="sm" variant="secondary">
          Search
        </SubmitButton>
      </form>
      <Ledger
        caption="Users"
        rows={users}
        rowKey={(u) => u.id}
        columns={[
          {
            key: "name",
            header: "Member",
            cell: (u) => (
              <span>
                {u.name}
                <span className="block text-caption text-stone">{u.email}</span>
              </span>
            ),
          },
          {
            key: "checks",
            header: "Checks",
            cell: (u) => (
              <span className="flex flex-wrap gap-1">
                {u.emailVerified ? <Tag tone="success">Email</Tag> : <Tag>Email</Tag>}
                {u.phoneVerified ? <Tag tone="success">Mobile</Tag> : <Tag>Mobile</Tag>}
                {u.role === "admin" ? <Tag tone="brand">Admin</Tag> : null}
                {u.banned ? <Tag tone="danger">Suspended</Tag> : null}
              </span>
            ),
          },
          {
            key: "activity",
            header: "Listed / rented",
            align: "right",
            cell: (u) => `${u.outfits} / ${u.rentals}`,
          },
          { key: "cancel", header: "Owner cancellations", align: "right", cell: (u) => u.ownerCancellations },
          { key: "joined", header: "Joined", cell: (u) => day.format(u.createdAt) },
          {
            key: "act",
            header: "Action",
            cell: (u) =>
              u.role === "admin" ? null : (
                <form action={adminCommandAction} className="flex items-end gap-2">
                  <input type="hidden" name="command" value={u.banned ? "reinstateUser" : "suspendUser"} />
                  <input type="hidden" name="userId" value={u.id} />
                  <input
                    name="reason"
                    required
                    minLength={5}
                    placeholder="Reason"
                    aria-label={"Reason for " + u.name}
                    className={field}
                  />
                  <SubmitButton size="sm" variant={u.banned ? "secondary" : "danger"}>
                    {u.banned ? "Reinstate" : "Suspend"}
                  </SubmitButton>
                </form>
              ),
          },
        ]}
      />
    </div>
  );
}
