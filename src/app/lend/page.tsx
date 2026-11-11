import type { Metadata } from "next";
import Image from "next/image";
import { marketplacePolicy as policy } from "@/config/marketplace-policy";
import { applyBasisPoints, basisPoints, formatInr, rupees, subtractPaise } from "@/shared/domain/money";
import { ButtonLink } from "@/shared/ui/button";
import { DefinitionList, Page, SectionIndex } from "@/shared/ui/layout";
import hanger from "../../../public/images/textures/sherwani-embroidery.jpg";

export const metadata: Metadata = {
  title: "Lend an outfit",
  description: "Earn from the occasionwear you wore once. You set the price and approve every rental.",
};

// An illustrative example only — the arithmetic of one rental, not a forecast of earnings.
const exampleFee = rupees(4_500);
const exampleCommission = applyBasisPoints(exampleFee, basisPoints(policy.commissionBps));

export default function LendPage() {
  return (
    <Page className="page-grid gap-y-16 pt-12 lg:pt-20">
      <header className="col-span-4 lg:col-span-7">
        <SectionIndex>For lenders</SectionIndex>
        <h1 className="mt-5 text-display-lg">
          Worn once. <span className="display-italic text-burgundy">Earning</span> since.
        </h1>
        <p className="mt-8 max-w-xl text-lg text-graphite">
          List the sherwani, lehenga or saree you wore to one wedding. You set the price, you approve every
          renter, and Peti holds the payment and deposit until the outfit is back.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/lend/outfits/new" size="lg">
            List an outfit
          </ButtonLink>
          <ButtonLink href="/how-it-works#lending" size="lg" variant="secondary">
            How lending works
          </ButtonLink>
        </div>
      </header>
      <figure className="col-span-4 lg:col-span-4 lg:col-start-9">
        <div className="relative aspect-[3/4] overflow-hidden bg-sand">
          <Image
            src={hanger}
            alt="Detail of an embroidered ivory sherwani"
            fill
            placeholder="blur"
            sizes="30vw"
            className="object-cover"
          />
        </div>
        <figcaption className="mt-3 text-caption text-stone">
          Photo: Bonaventure Fernandez / Pexels
        </figcaption>
      </figure>
      <section aria-labelledby="example" className="col-span-4 lg:col-span-6 lg:col-start-2">
        <h2 id="example" className="text-display-sm">
          An example, in rupees
        </h2>
        <p className="mt-3 text-sm text-graphite">
          Illustrative arithmetic for one three-day rental at a price you might choose — not a promise of
          demand.
        </p>
        <DefinitionList
          className="mt-6"
          items={[
            { term: "Rental fee you set", value: formatInr(exampleFee) },
            {
              term: `Peti's commission (${policy.commissionBps / 100}%)`,
              value: `− ${formatInr(exampleCommission)}`,
            },
            {
              term: "Paid to you",
              value: <strong>{formatInr(subtractPaise(exampleFee, exampleCommission))}</strong>,
            },
            {
              term: "Deposit",
              value: "Held for you; returned to the renter unless there is late return or damage",
            },
          ]}
        />
      </section>
      <section aria-labelledby="needs" className="col-span-4 lg:col-span-4 lg:col-start-9">
        <h2 id="needs" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
          What you will need
        </h2>
        <ul className="mt-2">
          {[
            "A confirmed email and mobile number",
            "A pickup address in Ahmedabad",
            "Clear photographs of the garment itself",
            "A tape measure — chest, waist, length",
            "A UPI ID for payouts",
          ].map((item) => (
            <li key={item} className="border-b border-rule py-3 text-ink">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
