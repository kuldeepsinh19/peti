import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { site } from "@/config/site";
import { Page, SectionIndex } from "@/shared/ui/layout";
import jodhpuri from "../../../../public/images/editorial/jodhpuri-courtyard.jpg";
import beadwork from "../../../../public/images/textures/beadwork.jpg";

export const metadata: Metadata = {
  title: "About",
  description: "Why Peti exists and what it is — and is not.",
};

export default function AboutPage() {
  return (
    <Page className="page-grid gap-y-12 pt-12 lg:pt-20">
      <header className="col-span-4 lg:col-span-8">
        <SectionIndex>About Peti</SectionIndex>
        <h1 className="mt-5 text-display-lg">
          A <span className="display-italic">peti</span> is a trunk of things kept for occasions.
        </h1>
      </header>
      <div className="col-span-4 flex flex-col gap-6 text-lg leading-relaxed text-graphite lg:col-span-6 lg:col-start-2">
        <p>
          In Gujarati households, the{" "}
          <span lang="gu" className="font-gujarati text-burgundy">
            {site.nameGujarati}
          </span>{" "}
          holds the garments that come out for weddings and go back in afterwards. Across {site.launchCity},
          there are thousands of them: sherwanis bought for one evening, lehengas worn for a sangeet, sarees
          too good to wear twice in front of the same relatives.
        </p>
        <p>
          Peti lets the people who own those garments lend them to the people who need them — directly. We do
          not buy, store, clean or ship clothes. Owners set the price and decide who rents. The platform holds
          the payment and the deposit, keeps the record of the garment&rsquo;s condition at handover and
          return, and steps in when something goes wrong.
        </p>
        <p>
          Peti is an open-source project. Its code, its architecture and its rules are public, including the{" "}
          <a href={site.repositoryUrl}>source code</a> and the reasoning behind each decision. This is an
          early release: there are no real rentals on it yet, and the listings you may see are demonstration
          data.
        </p>
      </div>
      <figure className="col-span-4 lg:col-span-4 lg:col-start-9 lg:row-span-2">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-sand">
          <Image
            src={jodhpuri}
            alt="A man in a pale blue Jodhpuri suit walking through a sandstone courtyard"
            fill
            placeholder="blur"
            sizes="(min-width: 64rem) 30vw, 100vw"
            className="object-cover"
          />
        </div>
        <figcaption className="mt-3 text-caption text-stone">
          Editorial photograph: Abhishek Shekhawat / Pexels. The model is not a Peti user.
        </figcaption>
      </figure>
      <section aria-labelledby="principles" className="col-span-4 lg:col-span-7 lg:col-start-2">
        <h2 id="principles" className="border-t border-ink pt-6 text-display-sm">
          What we hold ourselves to
        </h2>
        <dl className="mt-6 divide-y divide-rule border-b border-rule">
          {[
            ["Owners stay in control", "They own the garment, set the price and approve every rental."],
            [
              "Money is accounted for, not mixed",
              "Rental fee, deposit and commission are tracked separately.",
            ],
            [
              "No overclaiming",
              "We say exactly which checks a person has passed. We never claim identity verification we have not done.",
            ],
            [
              "Privacy by design",
              "Listings show a locality, never a street address. We do not collect ID documents.",
            ],
          ].map(([term, value]) => (
            <div key={term} className="grid gap-2 py-5 md:grid-cols-[16rem_1fr]">
              <dt className="font-display text-xl text-ink">{term}</dt>
              <dd className="text-graphite">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8">
          <Link href="/how-it-works" className="text-burgundy">
            How renting and lending works
          </Link>
        </p>
      </section>
      <div className="relative col-span-4 aspect-[3/1] overflow-hidden bg-sand lg:col-span-12">
        <Image src={beadwork} alt="" fill placeholder="blur" sizes="100vw" className="object-cover" />
      </div>
    </Page>
  );
}
