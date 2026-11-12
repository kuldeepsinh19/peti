import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireAdminOrNotFound } from "@/composition/session";
import { Button } from "@/shared/ui/button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";
import { adminCommandAction } from "../actions";

export const metadata: Metadata = { title: "Categories" };
const field =
  "border-0 border-b border-rule-strong bg-transparent py-2 text-sm focus:border-ink focus:outline-none";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminOrNotFound();
  const params = await searchParams;
  const rows = await container().admin.categories(actor);
  return (
    <div className="flex flex-col gap-10 pb-16">
      <PageHeader eyebrow="Administration" title="Categories" />
      {typeof params.error === "string" ? (
        <Notice tone="danger" title="Not saved">
          {params.error}
        </Notice>
      ) : null}
      {typeof params.done === "string" ? <Notice tone="success" title="Saved" /> : null}
      <Ledger
        caption="Categories"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", cell: (r) => r.name },
          { key: "slug", header: "Slug", cell: (r) => <span className="numeral">{r.slug}</span> },
          { key: "aud", header: "For", cell: (r) => r.audience.toLowerCase() },
          { key: "n", header: "Outfits", align: "right", cell: (r) => r.outfits },
          {
            key: "state",
            header: "State",
            cell: (r) => (r.isActive ? <Tag tone="success">Active</Tag> : <Tag>Hidden</Tag>),
          },
          {
            key: "act",
            header: "",
            cell: (r) => (
              <form action={adminCommandAction}>
                <input type="hidden" name="command" value="toggleCategory" />
                <input type="hidden" name="categoryId" value={r.id} />
                <input type="hidden" name="active" value={r.isActive ? "false" : "true"} />
                <Button type="submit" size="sm" variant="quiet">
                  {r.isActive ? "Hide" : "Show"}
                </Button>
              </form>
            ),
          },
        ]}
      />
      <section aria-labelledby="new" className="max-w-2xl">
        <SectionIndex>New category</SectionIndex>
        <h2 id="new" className="sr-only">
          New category
        </h2>
        <form action={adminCommandAction} className="mt-4 grid gap-5 md:grid-cols-2">
          <input type="hidden" name="command" value="createCategory" />
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Name</span>
            <input name="name" required className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Slug</span>
            <input name="slug" required pattern="[a-z0-9-]{2,40}" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">For</span>
            <select name="audience" className={field}>
              <option value="WOMEN">Women</option>
              <option value="MEN">Men</option>
              <option value="KIDS">Kids</option>
              <option value="UNISEX">Everyone</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Description</span>
            <input name="description" maxLength={200} className={field} />
          </label>
          <div>
            <Button type="submit">Add category</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
