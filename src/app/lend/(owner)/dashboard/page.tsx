import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { outfitStatusLabel } from "@/modules/listings";
import { outfitStatusTone } from "@/modules/listings/ui/status";
import { fileUrl } from "@/modules/media";
import { formatInr } from "@/shared/domain/money";
import { ButtonLink } from "@/shared/ui/button";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";

export const metadata: Metadata = { title: "Your outfits" };

export default async function OwnerDashboardPage() {
  const actor = await requireActorOrRedirect("/lend/dashboard");
  const rows = await container().listings.listMine(actor);
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Lending"
        title={
          <>
            Your <span className="display-italic">outfits</span>
          </>
        }
        actions={<ButtonLink href="/lend/outfits/new">List an outfit</ButtonLink>}
      />
      {!actor.phoneVerified || !actor.emailVerified ? (
        <Notice tone="warning" title="Verify your contact details" className="mt-8">
          You can prepare listings now, but you need a confirmed email and mobile number to submit them for
          review. <Link href="/account">Go to your account</Link>.
        </Notice>
      ) : null}
      <div className="mt-10">
        <Ledger
          caption="Your outfits"
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title="Nothing listed yet."
              action={<ButtonLink href="/lend/outfits/new">List your first outfit</ButtonLink>}
            >
              It takes about ten minutes: photographs, measurements, condition and prices.
            </EmptyState>
          }
          columns={[
            {
              key: "photo",
              header: "",
              className: "md:w-20",
              cell: (r) =>
                r.photoKey ? (
                  <span className="relative block aspect-[3/4] w-14 overflow-hidden bg-sand">
                    <Image src={fileUrl(r.photoKey)} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                ) : (
                  <span className="block aspect-[3/4] w-14 bg-sand" />
                ),
            },
            {
              key: "title",
              header: "Outfit",
              cell: (r) => (
                <Link href={`/lend/outfits/${r.id}/edit`} className="font-display text-lg">
                  {r.title}
                </Link>
              ),
            },
            { key: "category", header: "Category", cell: (r) => r.categoryName },
            {
              key: "status",
              header: "Status",
              cell: (r) => <Tag tone={outfitStatusTone[r.status]}>{outfitStatusLabel[r.status]}</Tag>,
            },
            { key: "bookings", header: "Open bookings", align: "right", cell: (r) => r.openBookings },
            {
              key: "price",
              header: "From",
              align: "right",
              cell: (r) => (r.minPricePaise ? formatInr(r.minPricePaise) : "—"),
            },
          ]}
        />
      </div>
    </div>
  );
}
