import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { statusLabel } from "@/modules/bookings";
import { DomainError } from "@/shared/domain/errors";
import { addDays, formatLocalDate, localDateInIndia } from "@/shared/domain/local-date";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import { calendarBlockAction } from "../../../../../_actions/bookings";

export const metadata: Metadata = { title: "Availability calendar" };

const field = "border-0 border-b border-rule-strong bg-transparent py-2 focus:border-ink focus:outline-none";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const actor = await requireActorOrRedirect("/lend/outfits/" + id + "/calendar");
  const { listings, bookings, clock } = container();
  const outfit = await listings.getForEdit(actor, id).catch((error: unknown) => {
    if (error instanceof DomainError) notFound();
    throw error;
  });
  const entries = await bookings.calendar(id);
  const query = await searchParams;
  const today = localDateInIndia(clock.now());

  return (
    <div className="flex flex-col gap-12 pb-16">
      <PageHeader
        eyebrow={<Link href={"/lend/outfits/" + id + "/edit"}>← {outfit.title}</Link>}
        title="Availability"
        lede={
          "Every confirmed booking holds its dates plus " +
          outfit.turnaroundDays +
          " cleaning day" +
          (outfit.turnaroundDays === 1 ? "" : "s") +
          ". Block dates when the outfit is not available — blocks can never overlap a booking."
        }
      />
      {typeof query.error === "string" ? (
        <Notice tone="danger" title="Not blocked">
          {query.error}
        </Notice>
      ) : null}
      {query.done === "1" ? <Notice tone="success" title="Calendar updated" /> : null}

      <section aria-labelledby="block" className="max-w-2xl">
        <SectionIndex index={1}>Block dates</SectionIndex>
        <h2 id="block" className="sr-only">
          Block dates
        </h2>
        <form action={calendarBlockAction} className="mt-4 grid gap-5 md:grid-cols-3">
          <input type="hidden" name="outfitId" value={id} />
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">From</span>
            <input type="date" name="from" required min={today} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">To (inclusive)</span>
            <input type="date" name="to" required min={today} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Note (private)</span>
            <input name="note" maxLength={200} placeholder="Family wedding" className={field} />
          </label>
          <div className="md:col-span-3">
            <SubmitButton>Block these dates</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="held">
        <SectionIndex index={2}>Held dates</SectionIndex>
        <h2 id="held" className="sr-only">
          Held dates
        </h2>
        {entries.length === 0 ? (
          <EmptyState title="The calendar is open." className="mt-4" />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4"
              >
                <div>
                  <p className="font-display text-xl">
                    {formatLocalDate(e.startsOn)} – {formatLocalDate(addDays(e.endsBefore, -1))}
                  </p>
                  <p className="text-sm text-graphite">
                    {e.kind === "BOOKING" ? (
                      <>
                        Booking {e.bookingReference} · {e.bookingStatus ? statusLabel[e.bookingStatus] : ""} ·
                        includes cleaning days
                      </>
                    ) : (
                      <>Blocked by you{e.note ? " · " + e.note : ""}</>
                    )}
                  </p>
                </div>
                {e.kind === "OWNER_BLOCK" ? (
                  <form action={calendarBlockAction}>
                    <input type="hidden" name="outfitId" value={id} />
                    <input type="hidden" name="holdId" value={e.id} />
                    <input type="hidden" name="intent" value="remove" />
                    <SubmitButton variant="quiet">Unblock</SubmitButton>
                  </form>
                ) : (
                  <Tag>Booked</Tag>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
