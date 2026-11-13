import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { getActor } from "@/composition/session";
import { fileUrl } from "@/modules/media";
import { formatInr } from "@/shared/domain/money";
import { NotFoundError } from "@/shared/domain/errors";
import { ButtonLink } from "@/shared/ui/button";
import { SubmitButton } from "@/shared/ui/submit-button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { conditionLabel, measurementLabel, occasionLabel, sizeLabel } from "@/shared/ui/labels";
import { DefinitionList, Page } from "@/shared/ui/layout";
import { toggleSavedAction } from "../actions";
import { BookingPanel } from "./booking-panel";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const actor = await getActor();
  try {
    return { actor, outfit: await container().search.outfit(actor, slug) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const outfit = await container()
    .search.outfit(null, (await params).slug)
    .catch(() => null);
  return outfit ? { title: outfit.title, description: outfit.description.slice(0, 160) } : {};
}

const memberSince = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default async function OutfitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { actor, outfit } = await load(slug);
  const [savedIds, reviews] = await Promise.all([
    container().search.savedIds(actor),
    container().reviews.forOutfit(outfit.id),
  ]);
  const saved = savedIds.has(outfit.id);
  const isOwner = actor?.userId === outfit.owner.id;
  const measurements = Object.entries(outfit.measurementsMm).filter(([, mm]) => mm !== null) as Array<
    [string, number]
  >;

  return (
    <Page className="pt-8 lg:pt-12">
      {outfit.status !== "ACTIVE" ? (
        <Notice tone="warning" title="Not visible to renters" className="mb-8">
          This listing is {outfit.status.toLowerCase().replace("_", " ")}. Only you and administrators can see
          it.
        </Notice>
      ) : null}
      <nav aria-label="Breadcrumb" className="mb-6 eyebrow text-graphite">
        <Link href="/explore" className="no-underline hover:underline">
          Explore
        </Link>{" "}
        /{" "}
        <Link href={`/categories/${outfit.category.slug}`} className="no-underline hover:underline">
          {outfit.category.name}
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-12">
        <section aria-label="Photographs" className="flex flex-col gap-(--spacing-gutter) lg:col-span-7">
          {outfit.photos.map((photo, i) => (
            <figure key={photo.key} className={i === 0 ? "" : "lg:w-4/5 lg:self-end"}>
              <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                <Image
                  src={fileUrl(photo.key)}
                  alt={photo.alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 64rem) 55vw, 100vw"
                  className="object-cover"
                />
              </div>
            </figure>
          ))}
        </section>

        <aside className="lg:col-span-5">
          <div className="flex flex-col gap-8 lg:sticky lg:top-6">
            <header className="flex flex-col gap-3">
              <p className="eyebrow text-graphite">
                {outfit.category.name} · {sizeLabel[outfit.sizeLabel]} · {outfit.locality.name},{" "}
                {outfit.locality.city}
              </p>
              <h1 className="text-display-md">{outfit.title}</h1>
              <p className="flex flex-wrap gap-2">
                {outfit.occasions.map((o) => (
                  <Tag key={o}>{occasionLabel[o] ?? o}</Tag>
                ))}
              </p>
            </header>

            <table className="w-full text-sm">
              <caption className="sr-only">Rental prices</caption>
              <tbody>
                {outfit.prices.map((p) => (
                  <tr key={p.durationDays} className="border-b border-rule">
                    <th scope="row" className="py-3 text-left font-normal text-graphite">
                      {p.durationDays} days
                    </th>
                    <td className="py-3 text-right font-display text-2xl numeral">
                      {formatInr(p.pricePaise)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-3 text-left font-normal text-graphite">
                    Refundable deposit
                  </th>
                  <td className="py-3 text-right numeral">{formatInr(outfit.depositPaise)}</td>
                </tr>
              </tbody>
            </table>

            {isOwner ? (
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/lend/outfits/${outfit.id}/edit`} variant="secondary">
                  Edit listing
                </ButtonLink>
                <ButtonLink href={`/lend/outfits/${outfit.id}/calendar`} variant="quiet">
                  Calendar
                </ButtonLink>
              </div>
            ) : outfit.status === "ACTIVE" ? (
              <BookingPanel outfit={outfit} actor={actor} searchParams={await searchParams} />
            ) : null}

            {!isOwner ? (
              actor ? (
                <form action={toggleSavedAction}>
                  <input type="hidden" name="outfitId" value={outfit.id} />
                  <input type="hidden" name="slug" value={outfit.slug} />
                  <SubmitButton variant="quiet">
                    {saved ? "Saved — remove from your list" : "Save for later"}
                  </SubmitButton>
                </form>
              ) : (
                <Link href={`/sign-in?next=/outfits/${outfit.slug}`} className="text-sm text-burgundy">
                  Sign in to save this outfit
                </Link>
              )
            ) : null}

            <section aria-labelledby="about">
              <h2 id="about" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
                About this outfit
              </h2>
              <p className="mt-4 whitespace-pre-line text-graphite">{outfit.description}</p>
            </section>

            <section aria-labelledby="fit">
              <h2 id="fit" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
                Measured by the owner
              </h2>
              {measurements.length ? (
                <DefinitionList
                  className="border-t-0"
                  items={measurements.map(([field, mm]) => ({
                    term: measurementLabel[field] ?? field,
                    value: (
                      <span className="numeral">
                        {mm / 10} cm <span className="text-stone">({Math.round(mm / 25.4)} in)</span>
                      </span>
                    ),
                  }))}
                />
              ) : (
                <p className="mt-3 text-sm text-graphite">No measurements recorded.</p>
              )}
              {outfit.measurementNotes ? (
                <p className="mt-3 text-sm text-graphite">{outfit.measurementNotes}</p>
              ) : null}
            </section>

            <section aria-labelledby="condition">
              <h2 id="condition" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
                Condition
              </h2>
              <DefinitionList
                className="border-t-0"
                items={[
                  { term: "Grade", value: conditionLabel[outfit.conditionGrade] ?? outfit.conditionGrade },
                  { term: "Owner's notes", value: outfit.conditionNotes },
                  ...(outfit.fabric ? [{ term: "Fabric", value: outfit.fabric }] : []),
                  ...(outfit.colour ? [{ term: "Colour", value: outfit.colour }] : []),
                  ...(outfit.brand ? [{ term: "Label", value: outfit.brand }] : []),
                  { term: "Retail value", value: formatInr(outfit.retailValuePaise) },
                  {
                    term: "Cleaning days",
                    value: `${outfit.turnaroundDays} day${outfit.turnaroundDays === 1 ? "" : "s"} blocked after each rental`,
                  },
                ]}
              />
            </section>

            {reviews.length ? (
              <section aria-labelledby="reviews">
                <h2 id="reviews" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
                  From people who rented it
                </h2>
                <ul>
                  {reviews.map((r) => (
                    <li key={r.id} className="border-b border-rule py-3 text-sm">
                      <p className="text-burgundy" aria-label={r.rating + " out of 5"}>
                        {"★".repeat(r.rating)}
                        {"☆".repeat(5 - r.rating)}
                      </p>
                      {r.comment ? <p className="mt-1">{r.comment}</p> : null}
                      <p className="mt-1 text-caption text-stone">{r.authorName}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="lender" className="border-t border-ink pt-4">
              <h2 id="lender" className="eyebrow font-sans text-graphite">
                Lent by
              </h2>
              <p className="mt-2 font-display text-2xl">{outfit.owner.displayName}</p>
              <p className="text-sm text-graphite">
                Member since {memberSince.format(outfit.owner.memberSince)} · {outfit.owner.completedRentals}{" "}
                completed rental{outfit.owner.completedRentals === 1 ? "" : "s"}
                {outfit.owner.rating
                  ? ` · ${outfit.owner.rating} / 5 from ${outfit.owner.ratingCount} review${outfit.owner.ratingCount === 1 ? "" : "s"}`
                  : " · no reviews yet"}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  {outfit.owner.emailVerified ? (
                    <Tag tone="success">Email confirmed</Tag>
                  ) : (
                    <Tag>Email not confirmed</Tag>
                  )}
                </li>
                <li>
                  {outfit.owner.phoneVerified ? (
                    <Tag tone="success">Mobile verified</Tag>
                  ) : (
                    <Tag>Mobile not verified</Tag>
                  )}
                </li>
                <li>
                  <Tag>ID not checked by Peti</Tag>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </div>
    </Page>
  );
}
