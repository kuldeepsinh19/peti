import type { ReactNode } from "react";
import Link from "next/link";
import { formatInr } from "@/shared/domain/money";
import { Tag } from "@/shared/ui/feedback";
import { conditionLabel, measurementLabel, occasionLabel, sizeLabel } from "@/shared/ui/labels";
import { DefinitionList } from "@/shared/ui/layout";
import type { OutfitCard, OutfitDetail } from "../application/ports";
import { OutfitGallery } from "./outfit-gallery";

const memberSince = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export interface OutfitReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
}

/** The card an outfit gets in Explore, built from its detail (for the owner's preview). */
export function cardFromDetail(outfit: OutfitDetail): OutfitCard {
  const cheapest = [...outfit.prices].sort((a, b) => a.pricePaise - b.pricePaise)[0];
  return {
    id: outfit.id,
    slug: outfit.slug,
    title: outfit.title,
    categoryName: outfit.category.name,
    localityName: outfit.locality.name,
    sizeLabel: outfit.sizeLabel,
    occasions: outfit.occasions,
    pricePaise: cheapest?.pricePaise ?? 0,
    priceDays: cheapest?.durationDays ?? 0,
    depositPaise: outfit.depositPaise,
    photoKey: outfit.photos[0]?.key ?? null,
    photoAlt: outfit.photos[0]?.alt ?? null,
    ownerName: outfit.owner.displayName,
    ownerRating: outfit.owner.rating,
    ownerRatingCount: outfit.owner.ratingCount,
    ownerCompletedRentals: outfit.owner.completedRentals,
  };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Everything a renter sees about one outfit. Shared by the public outfit page and the owner's preview, so
 * the preview is the page, not an imitation of it. Actions (booking, saving, owner links) come from the
 * caller; this component never decides who may do what.
 */
export function OutfitDetailView({
  outfit,
  actions,
  reviews = [],
  availability,
  policies,
  breadcrumb = true,
}: {
  outfit: OutfitDetail;
  /** The booking panel, owner links or a preview note. */
  actions?: ReactNode;
  reviews?: readonly OutfitReviewItem[];
  availability?: ReactNode;
  policies?: ReactNode;
  breadcrumb?: boolean;
}) {
  const measurements = Object.entries(outfit.measurementsMm).filter(([, mm]) => mm !== null) as Array<
    [string, number]
  >;
  return (
    <>
      {breadcrumb ? (
        <nav aria-label="Breadcrumb" className="mb-6 eyebrow text-graphite">
          <Link href="/explore" className="no-underline hover:underline">
            Explore outfits
          </Link>{" "}
          /{" "}
          <Link href={`/categories/${outfit.category.slug}`} className="no-underline hover:underline">
            {outfit.category.name}
          </Link>
        </nav>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-12">
        <section aria-label="Photographs" className="lg:col-span-7">
          <div className="lg:sticky lg:top-6">
            <OutfitGallery title={outfit.title} photos={outfit.photos} />
          </div>
        </section>

        <div className="lg:col-span-5">
          <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
              <p className="eyebrow text-graphite">
                {outfit.category.name} · {sizeLabel[outfit.sizeLabel] ?? outfit.sizeLabel} ·{" "}
                {outfit.locality.name}, {outfit.locality.city}
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

            {actions}

            <Section id="about" title="About this outfit">
              <p className="mt-4 whitespace-pre-line text-graphite">{outfit.description}</p>
            </Section>

            {availability ? (
              <Section id="availability" title="Availability">
                {availability}
              </Section>
            ) : null}

            <Section id="fit" title="Measured by the owner">
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
            </Section>

            <Section id="condition" title="Condition">
              <DefinitionList
                className="border-t-0"
                items={[
                  { term: "Grade", value: conditionLabel[outfit.conditionGrade] ?? outfit.conditionGrade },
                  ...(outfit.conditionNotes ? [{ term: "Owner's notes", value: outfit.conditionNotes }] : []),
                  ...(outfit.fabric ? [{ term: "Fabric", value: outfit.fabric }] : []),
                  ...(outfit.colour ? [{ term: "Colour", value: outfit.colour }] : []),
                  ...(outfit.brand ? [{ term: "Label", value: outfit.brand }] : []),
                  { term: "What it cost new", value: formatInr(outfit.retailValuePaise) },
                  {
                    term: "Cleaning days",
                    value: `${outfit.turnaroundDays} day${outfit.turnaroundDays === 1 ? "" : "s"} blocked after each rental`,
                  },
                ]}
              />
            </Section>

            {policies}

            {reviews.length ? (
              <Section id="reviews" title="From people who rented it">
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
              </Section>
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
        </div>
      </div>
    </>
  );
}
