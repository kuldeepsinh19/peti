import Image from "next/image";
import Link from "next/link";
import { occasions, site } from "@/config/site";
import { ButtonLink } from "@/shared/ui/button";
import { Page, SectionIndex } from "@/shared/ui/layout";
import { DiscoveryStrip } from "./_components/discovery-strip";
import hero from "../../public/images/editorial/hero-cream-sherwani.jpg";
import lehengaBack from "../../public/images/editorial/lehenga-back-view.jpg";
import bandhgala from "../../public/images/editorial/black-bandhgala.jpg";
import saree from "../../public/images/editorial/golden-saree-tree.jpg";
import embroidery from "../../public/images/textures/red-embroidery.jpg";

export default function HomePage() {
  return (
    <>
      <Hero />
      <DiscoveryStrip />
      <OccasionContents />
      <CategoryFeature />
      <TextileBand />
      <HowLendingWorks />
      <TrustLedger />
    </>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Page className="page-grid pt-10 pb-12 lg:pt-16 lg:pb-20">
        <div className="relative z-10 col-span-4 flex flex-col gap-8 lg:col-span-8 lg:col-start-1 lg:row-start-1 lg:pt-16">
          <SectionIndex index="Nº 1">Peer-to-peer occasionwear · {site.launchCity}</SectionIndex>
          <h1 id="hero-title" className="text-display-xl">
            The city&rsquo;s wardrobe,
            <br />
            <span className="display-italic text-burgundy">lent</span> by its people.
          </h1>
          <p className="max-w-md text-lg text-graphite lg:ml-[16.66%]">
            Rent sherwanis, Jodhpuri suits, lehengas and sarees from people in {site.launchCity} who wore them
            once. Or lend yours, and let it earn between weddings.
          </p>
          <div className="flex flex-wrap gap-3 lg:ml-[16.66%]">
            <ButtonLink href="/explore" size="lg">
              Explore outfits
            </ButtonLink>
            <ButtonLink href="/lend" size="lg" variant="secondary">
              Lend an outfit
            </ButtonLink>
          </div>
        </div>
        <figure className="col-span-4 mt-10 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:mt-0">
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-sand">
            <Image
              src={hero}
              alt="A cream sherwani hanging in front of a carved golden door framed by flowers"
              fill
              priority
              placeholder="blur"
              sizes="(min-width: 64rem) 40vw, 100vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-3 flex justify-between gap-4 text-caption text-stone">
            <span>Fig. 1 — Ivory thread-work sherwani, ready for its second sitting.</span>
            <span className="shrink-0">Photo: ARTO SURAJ / Unsplash</span>
          </figcaption>
        </figure>
      </Page>
    </section>
  );
}

function OccasionContents() {
  return (
    <section aria-labelledby="occasions-title" className="mt-(--spacing-section)">
      <Page className="page-grid gap-y-10">
        <div className="col-span-4 lg:col-span-4">
          <SectionIndex index={2}>Contents</SectionIndex>
          <h2 id="occasions-title" className="mt-4 text-display-md">
            Dressed for <span className="display-italic">every</span> ceremony.
          </h2>
          <p className="mt-6 max-w-sm text-graphite">
            A wedding in Gujarat is rarely one evening. Browse by the occasion you are dressing for, then
            filter by size and dates.
          </p>
        </div>
        <ol className="col-span-4 border-t border-ink lg:col-span-7 lg:col-start-6">
          {occasions.map((occasion, i) => (
            <li key={occasion.value} className="border-b border-rule">
              <Link
                href={`/explore?occasion=${occasion.value}`}
                className="group grid grid-cols-[3rem_1fr_auto] items-baseline gap-4 py-5 no-underline"
              >
                <span className="eyebrow text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
                  <span className="font-display text-3xl transition-colors group-hover:text-burgundy md:text-4xl">
                    {occasion.label}
                  </span>
                  <span className="text-sm text-graphite">{occasion.note}</span>
                </span>
                <span aria-hidden className="text-graphite transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Page>
    </section>
  );
}

type CategoryHref = "/categories/lehenga" | "/categories/bandhgala" | "/categories/saree";

function CategoryFeature() {
  return (
    <section aria-labelledby="categories-title" className="mt-(--spacing-section)">
      <Page className="page-grid gap-y-12">
        <div className="col-span-4 lg:col-span-12">
          <SectionIndex index={3}>The edit</SectionIndex>
          <h2 id="categories-title" className="mt-4 max-w-3xl text-display-md">
            Worn once, kept carefully, <span className="display-italic">ready again.</span>
          </h2>
        </div>
        <div className="col-span-4 flex flex-col gap-12 lg:col-span-6">
          <CategoryFigure
            href="/categories/lehenga"
            title="Lehengas"
            caption="Bridal, sangeet and reception lehengas, with real measurements from their owners."
            image={lehengaBack}
            alt="The back of a crimson bridal lehenga with a gold-edged dupatta"
          />
          <aside className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-ink pt-6 lg:ml-[16.66%]">
            <p className="row-span-2 font-display text-5xl leading-none text-brass">cm</p>
            <p className="eyebrow text-graphite">A note on fit</p>
            <p className="text-graphite">
              Sizes vary wildly between designers. Every listing records the garment&rsquo;s measured chest,
              waist, hip and length, so you can filter by the numbers that matter rather than S, M or L.
            </p>
          </aside>
        </div>
        <div className="col-span-4 flex flex-col gap-12 lg:col-span-5 lg:col-start-8 lg:pt-40">
          <CategoryFigure
            href="/categories/bandhgala"
            title="Jodhpuri & bandhgala"
            caption="Structured, close-collared and cut for receptions."
            image={bandhgala}
            alt="A man in a black bandhgala jacket with a red pocket square"
          />
          <CategoryFigure
            href="/categories/saree"
            title="Sarees"
            caption="Banarasi and Kanchipuram silks, tissue and threadwork."
            image={saree}
            alt="A woman in a golden tissue saree standing beside a tree"
            className="lg:w-4/5 lg:self-end"
          />
        </div>
      </Page>
    </section>
  );
}

function CategoryFigure({
  href,
  title,
  caption,
  image,
  alt,
  className,
}: {
  href: CategoryHref;
  title: string;
  caption: string;
  image: typeof hero;
  alt: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      <Link href={href} className="group block no-underline">
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-sand">
          <Image
            src={image}
            alt={alt}
            fill
            placeholder="blur"
            sizes="(min-width: 64rem) 45vw, 100vw"
            className="object-cover transition-transform duration-700 ease-(--ease-editorial) group-hover:scale-[1.02]"
          />
        </div>
        <figcaption className="mt-4 flex items-baseline justify-between gap-4 border-t border-ink pt-3">
          <span className="font-display text-2xl group-hover:text-burgundy">{title}</span>
          <span className="max-w-[60%] text-right text-caption text-graphite">{caption}</span>
        </figcaption>
      </Link>
    </figure>
  );
}

function TextileBand() {
  return (
    <section aria-label="Textile detail" className="mt-(--spacing-section)">
      <div className="relative h-[42vh] min-h-64 w-full overflow-hidden bg-sand lg:h-[56vh]">
        <Image
          src={embroidery}
          alt=""
          fill
          placeholder="blur"
          sizes="100vw"
          className="object-cover object-[50%_40%]"
        />
      </div>
      <Page className="page-grid">
        <p className="col-span-4 mt-6 display-italic text-display-sm text-ink lg:col-span-7 lg:col-start-5">
          &ldquo;Hand embroidery takes weeks. It deserves more than one evening.&rdquo;
        </p>
        <p className="col-span-4 mt-3 text-caption text-stone lg:col-span-7 lg:col-start-5">
          Embroidered red textile · Photo: Ms. Parikh / Pexels
        </p>
      </Page>
    </section>
  );
}

const steps = [
  {
    numeral: "I",
    title: "List what you own",
    body: "Photograph the garment, record its real measurements and condition, choose 2, 3, 5 or 7-day prices and a refundable deposit. Every listing is reviewed before it goes live.",
  },
  {
    numeral: "II",
    title: "Approve who wears it",
    body: "Renters request dates; you accept or decline. A cleaning day is blocked after every rental, and no two confirmed rentals can ever overlap.",
  },
  {
    numeral: "III",
    title: "Hand over, get it back, get paid",
    body: "Meet in Ahmedabad and photograph the condition at handover and at return. The renter's deposit is held until you confirm the outfit came back as it left.",
  },
] as const;

function HowLendingWorks() {
  return (
    <section
      aria-labelledby="lending-title"
      className="mt-(--spacing-section) bg-olive-deep py-(--spacing-section) text-paper"
    >
      <Page className="page-grid gap-y-12">
        <div className="col-span-4 lg:col-span-5">
          <p className="flex items-center gap-3 eyebrow text-sand">
            <span className="text-brass numeral">04</span>
            <span aria-hidden className="h-px w-8 bg-sand/50" />
            <span>For lenders</span>
          </p>
          <h2 id="lending-title" className="mt-4 text-display-md text-paper">
            Your wardrobe, <span className="display-italic text-sand">earning</span> between weddings.
          </h2>
          <p className="mt-6 max-w-md text-sand">
            You set the price. Peti keeps 15% of the rental fee, and only on rentals that go ahead. Deposits
            are never income for Peti: they go back to the renter, or to you if something was damaged.
          </p>
          <ButtonLink href="/lend" variant="inverse" size="lg" className="mt-8">
            Start lending
          </ButtonLink>
        </div>
        <ol className="col-span-4 border-t border-sand/40 lg:col-span-6 lg:col-start-7">
          {steps.map((step) => (
            <li key={step.numeral} className="grid grid-cols-[3.5rem_1fr] gap-4 border-b border-sand/25 py-8">
              <span className="font-display text-4xl text-brass">{step.numeral}</span>
              <div>
                <h3 className="text-2xl text-paper">{step.title}</h3>
                <p className="mt-2 text-sand">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Page>
    </section>
  );
}

function TrustLedger() {
  const checked = [
    "Email address confirmed by a link",
    "Mobile number confirmed by a one-time code",
    "Payment confirmed by the payment provider before any booking is confirmed",
    "Condition photographed at handover and again at return",
    "Reviews only from people who completed a rental together",
  ];
  const notChecked = [
    "We do not check identity documents, and never ask for Aadhaar",
    "We do not inspect garments ourselves — the condition reports are the record",
    "We do not deliver or dry-clean; owners and renters meet in person",
  ];
  return (
    <section aria-labelledby="trust-title" className="mt-(--spacing-section)">
      <Page className="page-grid gap-y-10">
        <div className="col-span-4 lg:col-span-12">
          <SectionIndex index={5}>Trust, plainly stated</SectionIndex>
          <h2 id="trust-title" className="mt-4 max-w-3xl text-display-md">
            What we check, and what we <span className="display-italic">don&rsquo;t</span>.
          </h2>
        </div>
        <TrustColumn
          className="col-span-4 lg:col-span-6"
          title="Checked on every rental"
          items={checked}
          mark="✓"
        />
        <TrustColumn
          className="col-span-4 lg:col-span-5 lg:col-start-8"
          title="Not checked — and we say so"
          items={notChecked}
          mark="—"
        />
        <p className="col-span-4 lg:col-span-12">
          <Link href="/trust-and-safety" className="text-burgundy">
            Read the full trust and safety policy
          </Link>
        </p>
      </Page>
    </section>
  );
}

function TrustColumn({
  title,
  items,
  mark,
  className,
}: {
  title: string;
  items: string[];
  mark: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="border-b border-ink pb-3 eyebrow font-sans text-graphite">{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item} className="grid grid-cols-[2rem_1fr] border-b border-rule py-4 text-ink">
            <span aria-hidden className="text-burgundy">
              {mark}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
