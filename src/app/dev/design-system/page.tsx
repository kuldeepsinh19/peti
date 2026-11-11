import type { Metadata } from "next";
import { formatInr, rupees } from "@/shared/domain/money";
import { Button, ButtonLink } from "@/shared/ui/button";
import { EmptyState, ListingGridSkeleton, Notice, Tag } from "@/shared/ui/feedback";
import {
  CheckboxField,
  Fieldset,
  FormMessage,
  SelectField,
  TextAreaField,
  TextField,
} from "@/shared/ui/form";
import { DefinitionList, Page, PageHeader, SectionIndex } from "@/shared/ui/layout";
import { Ledger } from "@/shared/ui/ledger";
import { OverlayDemos } from "./overlay-demos";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const colours = [
  ["paper", "bg-paper", "#FBF8F2", "Page background"],
  ["ivory", "bg-ivory", "#F6F1E7", "Alternate background"],
  ["sand", "bg-sand", "#E6D9C2", "Panels, bands"],
  ["ink", "bg-ink", "#1E1B18", "Primary text, strong rules"],
  ["graphite", "bg-graphite", "#4A443E", "Secondary text"],
  ["stone", "bg-stone", "#6F675E", "Captions on paper/ivory"],
  ["burgundy", "bg-burgundy", "#6B1F2A", "Brand, links, primary actions"],
  ["olive", "bg-olive", "#5B5E3F", "Secondary accent"],
  ["olive-deep", "bg-olive-deep", "#454830", "Dark sections"],
  ["brass", "bg-brass", "#B0832F", "Rules and numerals only"],
] as const;

const sampleRows = [
  { id: "RNT-7F3K2Q", outfit: "Ivory thread-work sherwani", status: "Confirmed", amount: 18_500_00 },
  { id: "RNT-2M8P4D", outfit: "Teal Banarasi silk saree", status: "Awaiting payment", amount: 6_200_00 },
];

export default function DesignSystemPage() {
  return (
    <Page className="pb-24">
      <PageHeader
        eyebrow="Reference"
        title={
          <>
            Design <span className="display-italic">system</span>
          </>
        }
        lede="Every token and component used across Peti. Rules for their use are in docs/product/design-direction.md."
      />

      <section className="mt-16">
        <SectionIndex index={1}>Typography</SectionIndex>
        <div className="mt-6 flex flex-col gap-6 border-t border-rule pt-6">
          <p className="text-display-xl">Display XL</p>
          <p className="text-display-lg">
            Display LG <span className="display-italic">italic</span>
          </p>
          <p className="text-display-md">Display MD — Bodoni Moda</p>
          <p className="text-display-sm">Display SM — section titles</p>
          <p className="max-w-prose text-lg">
            Body large — Schibsted Grotesk. Rent sherwanis, Jodhpuri suits, lehengas and sarees from people
            who wore them once.
          </p>
          <p className="max-w-prose">Body — the default reading size for descriptions and forms.</p>
          <p className="text-caption text-stone">Caption — photo credits and metadata.</p>
          <p className="eyebrow text-graphite">Eyebrow — small capitals for labels</p>
          <p lang="gu" className="font-gujarati text-3xl text-burgundy">
            પેટી — Rasa for Gujarati accents
          </p>
          <p className="font-display text-4xl numeral">{formatInr(rupees(12_500))} · tabular numerals</p>
        </div>
      </section>

      <section className="mt-16">
        <SectionIndex index={2}>Colour</SectionIndex>
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-rule pt-6 md:grid-cols-5">
          {colours.map(([name, cls, hex, use]) => (
            <li key={name} className="flex flex-col gap-2">
              <span className={`block aspect-[4/3] border border-rule ${cls}`} />
              <span className="font-display text-lg">{name}</span>
              <span className="eyebrow text-stone numeral">{hex}</span>
              <span className="text-caption text-graphite">{use}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <SectionIndex index={3}>Buttons</SectionIndex>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-rule pt-6">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="link">Link</Button>
          <Button variant="danger">Danger</Button>
          <Button pending>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <ButtonLink href="/explore" variant="secondary">
            Link styled as button
          </ButtonLink>
          <span className="bg-olive-deep p-3">
            <Button variant="inverse">Inverse</Button>
          </span>
        </div>
      </section>

      <section className="mt-16">
        <SectionIndex index={4}>Forms</SectionIndex>
        <form className="mt-6 grid max-w-2xl gap-8 border-t border-rule pt-6">
          <FormMessage>Something went wrong. Check the highlighted fields.</FormMessage>
          <TextField
            label="Outfit name"
            placeholder="Ivory thread-work sherwani"
            hint="Shown as the listing title."
          />
          <TextField label="Rental price" prefix="₹" inputMode="numeric" defaultValue="4500" />
          <TextField label="Chest" error="Enter a measurement between 10 and 300 cm." defaultValue="9" />
          <SelectField
            label="Category"
            placeholder="Choose a category"
            options={[
              { value: "sherwani", label: "Sherwani" },
              { value: "lehenga", label: "Lehenga" },
            ]}
          />
          <TextAreaField label="Condition notes" optional hint="Mention any flaws, however small." />
          <Fieldset legend="Agreement" description="Fieldsets group related controls under a serif legend.">
            <CheckboxField label="I accept the rental terms and the cancellation policy." />
          </Fieldset>
        </form>
      </section>

      <section className="mt-16">
        <SectionIndex index={5}>Status and feedback</SectionIndex>
        <div className="mt-6 flex flex-col gap-6 border-t border-rule pt-6">
          <div className="flex flex-wrap gap-3">
            <Tag>Pending approval</Tag>
            <Tag tone="warning">Awaiting payment</Tag>
            <Tag tone="success">Confirmed</Tag>
            <Tag tone="brand">Active</Tag>
            <Tag tone="olive">Completed</Tag>
            <Tag tone="danger">Disputed</Tag>
          </div>
          <Notice title="Dates held for you">Pay within 12 hours to confirm the booking.</Notice>
          <Notice tone="danger" title="Payment failed">
            The provider declined the payment. You can try again.
          </Notice>
          <EmptyState
            title="No rentals yet."
            action={<ButtonLink href="/explore">Explore outfits</ButtonLink>}
          >
            When you request an outfit, it will appear here with its status.
          </EmptyState>
        </div>
      </section>

      <section className="mt-16">
        <SectionIndex index={6}>Ledger and definition list</SectionIndex>
        <div className="mt-6 grid gap-10 border-t border-rule pt-6 lg:grid-cols-2">
          <Ledger
            caption="Sample bookings"
            rows={sampleRows}
            rowKey={(r) => r.id}
            columns={[
              { key: "id", header: "Reference", cell: (r) => <span className="numeral">{r.id}</span> },
              { key: "outfit", header: "Outfit", cell: (r) => r.outfit },
              { key: "status", header: "Status", cell: (r) => <Tag>{r.status}</Tag> },
              { key: "amount", header: "Amount", align: "right", cell: (r) => formatInr(r.amount) },
            ]}
          />
          <DefinitionList
            items={[
              { term: "Rental fee", value: formatInr(rupees(4_500)) },
              { term: "Security deposit", value: formatInr(rupees(5_000)) },
              { term: "Total today", value: <strong>{formatInr(rupees(9_500))}</strong> },
            ]}
          />
        </div>
      </section>

      <section className="mt-16">
        <SectionIndex index={7}>Modal, sheet and loading</SectionIndex>
        <div className="mt-6 flex flex-col gap-10 border-t border-rule pt-6">
          <OverlayDemos />
          <ListingGridSkeleton count={3} />
        </div>
      </section>
    </Page>
  );
}
