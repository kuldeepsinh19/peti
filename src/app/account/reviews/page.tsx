import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { formDataToObject } from "@/shared/contracts/validation";
import { Button } from "@/shared/ui/button";
import { EmptyState, Notice, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import { runAction } from "../../_lib/action";

export const metadata: Metadata = { title: "Reviews" };
const field = "border-0 border-b border-rule-strong bg-transparent py-2 focus:border-ink focus:outline-none";

async function submitReviewAction(formData: FormData) {
  "use server";
  const result = await runAction("submitReview", async (actor): Promise<void> => {
    await container().reviews.submit(actor, formDataToObject(formData));
  });
  revalidatePath("/account/reviews");
  redirect(
    "/account/reviews?" + (result.ok ? "done=1" : "error=" + encodeURIComponent(result.error.message)),
  );
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/account/reviews");
  const { reviews } = container();
  const [awaiting, received, written] = await Promise.all([
    reviews.awaiting(actor),
    reviews.received(actor),
    reviews.written(actor),
  ]);
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-14 pb-16">
      <PageHeader
        eyebrow="Reviews"
        title="Reviews"
        lede="Only the two people in a completed rental can review each other. Reviews stay hidden until both have written one, or 14 days pass."
      />
      {typeof params.error === "string" ? (
        <Notice tone="danger" title="Not saved">
          {params.error}
        </Notice>
      ) : null}
      {params.done === "1" ? <Notice tone="success" title="Thank you — your review is saved" /> : null}

      <section aria-labelledby="to-write">
        <SectionIndex index={1}>To write</SectionIndex>
        <h2 id="to-write" className="sr-only">
          To write
        </h2>
        {awaiting.length === 0 ? (
          <EmptyState title="Nothing waiting for a review." className="mt-4" />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {awaiting.map((b) => {
              const aboutOwner = b.renterId === actor.userId;
              return (
                <li key={b.bookingId} className="border-b border-rule py-6">
                  <p className="font-display text-xl">{b.outfitTitle}</p>
                  <p className="text-sm text-graphite">
                    Review {aboutOwner ? b.ownerName + ", who lent it" : b.renterName + ", who rented it"} ·{" "}
                    {b.reference}
                  </p>
                  <form action={submitReviewAction} className="mt-4 grid max-w-xl gap-4">
                    <input type="hidden" name="bookingId" value={b.bookingId} />
                    <fieldset className="flex flex-wrap gap-4">
                      <legend className="mb-2 eyebrow text-graphite">Rating</legend>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <label key={n} className="flex items-center gap-2 text-sm">
                          <input type="radio" name="rating" value={n} required className="accent-burgundy" />
                          <span aria-label={n + " out of 5"}>{stars(n)}</span>
                        </label>
                      ))}
                    </fieldset>
                    <label className="flex flex-col gap-1">
                      <span className="eyebrow text-graphite">Comment (optional)</span>
                      <textarea name="comment" rows={3} maxLength={1000} className={field} />
                    </label>
                    <div>
                      <Button type="submit">Submit review</Button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="received" className="grid gap-12 lg:grid-cols-2">
        <div>
          <SectionIndex index={2}>About you</SectionIndex>
          <h2 id="received" className="sr-only">
            About you
          </h2>
          {received.length === 0 ? (
            <EmptyState title="No published reviews yet." className="mt-4" />
          ) : (
            <ul className="mt-4 border-t border-ink">
              {received.map((r) => (
                <li key={r.id} className="border-b border-rule py-4">
                  <p className="text-burgundy" aria-label={r.rating + " out of 5"}>
                    {stars(r.rating)}
                  </p>
                  {r.comment ? <p className="mt-1">{r.comment}</p> : null}
                  <p className="mt-1 text-caption text-stone">
                    {r.authorName} · {r.outfitTitle}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionIndex index={3}>Written by you</SectionIndex>
          {written.length === 0 ? (
            <EmptyState title="You have not written any reviews." className="mt-4" />
          ) : (
            <ul className="mt-4 border-t border-ink">
              {written.map((r) => (
                <li key={r.id} className="border-b border-rule py-4">
                  <p className="flex items-center gap-3">
                    <span className="text-burgundy">{stars(r.rating)}</span>
                    {r.visible ? <Tag tone="success">Published</Tag> : <Tag>Hidden until both review</Tag>}
                  </p>
                  {r.comment ? <p className="mt-1">{r.comment}</p> : null}
                  <p className="mt-1 text-caption text-stone">
                    About {r.subjectName} · {r.outfitTitle}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
