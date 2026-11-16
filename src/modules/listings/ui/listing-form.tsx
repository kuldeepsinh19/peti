"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { marketplacePolicy } from "@/config/marketplace-policy";
import type { ActionResult } from "@/shared/contracts/action-result";
import { formatInr } from "@/shared/domain/money";
import { Button } from "@/shared/ui/button";
import { Fieldset, FormMessage, SelectField, TextAreaField, TextField } from "@/shared/ui/form";
import { conditionLabel, measurementLabel, occasionLabel, sizeLabel } from "@/shared/ui/labels";
import {
  CONDITION_GRADES,
  type ListingFormInput,
  listingFormSchema,
  MEASUREMENT_FIELDS,
  OCCASIONS,
  SIZE_LABELS,
} from "../application/contracts";

type Option = { id: string; name: string };

export interface ListingFormProps {
  categories: Option[];
  localities: Option[];
  addresses: Array<Option & { localityId: string }>;
  defaults?: Partial<ListingFormInput>;
  submitLabel: string;
  /** Under the submit button: what happens next. */
  nextStepNote?: string;
  action: (input: unknown) => Promise<ActionResult<{ redirectTo: string; message?: string }>>;
}

/** Fields under "More about the outfit": opened automatically when one of them has an error. */
const MORE_FIELDS = [
  "colour",
  "fabric",
  "brand",
  "conditionNotes",
  "turnaroundDays",
  "measurementNotes",
  ...MEASUREMENT_FIELDS,
] as const;

const wholeRupees = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Create and edit form for a listing: the essentials a renter decides on first (what it is, what it
 * costs, where it is), and everything else under "More about the outfit". The same Zod contract validates
 * here and again on the server.
 */
export function ListingForm({
  categories,
  localities,
  addresses,
  defaults,
  submitLabel,
  nextStepNote = "Next: add photographs, then preview the listing before you submit it.",
  action,
}: ListingFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      turnaroundDays: marketplacePolicy.turnaroundDaysDefault,
      conditionGrade: "GOOD",
      conditionNotes: "",
      occasions: [],
      ...defaults,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const err = (name: string) => (errors as Record<string, { message?: string } | undefined>)[name]?.message;
  const moreHasError = MORE_FIELDS.some((f) => err(f));

  // Live guidance from what the owner has typed so far (display only; the server decides).
  const watched = useWatch({
    control: form.control,
    name: ["retailValueRupees", ...marketplacePolicy.durationOptionsDays.map((d) => `price${d}` as "price3")],
  });
  const retail = wholeRupees(watched[0]);
  const lowest = watched
    .slice(1)
    .map((v, i): { rupees: number | null; days: number } => ({
      rupees: wholeRupees(v),
      days: marketplacePolicy.durationOptionsDays[i] ?? 0,
    }))
    .filter((p): p is { rupees: number; days: number } => p.rupees !== null)
    .sort((a, b) => a.rupees - b.rupees)[0];
  const earnPaise = lowest
    ? lowest.rupees * 100 - Math.round((lowest.rupees * 100 * marketplacePolicy.commissionBps) / 10_000)
    : null;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await action(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        form.setError(field as keyof ListingFormInput, { message: messages[0] });
      }
      setFormError(result.error.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  });

  if (addresses.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col gap-4 border border-rule-strong p-6">
        <p className="font-display text-2xl">First, where will renters collect it?</p>
        <p className="text-graphite">
          Add the address renters collect the outfit from. They only ever see its locality; the full address
          is shared once a booking is paid.
        </p>
        <p>
          <Link href="/account/addresses">Add a pickup address</Link>, then come back to list your outfit.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-12">
      <FormMessage>{formError}</FormMessage>

      <Fieldset legend="The outfit">
        <TextField
          label="Outfit name"
          placeholder="Ivory thread-work sherwani"
          {...form.register("title")}
          error={err("title")}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <SelectField
            label="Category"
            placeholder="Choose a category"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            {...form.register("categoryId")}
            error={err("categoryId")}
          />
          <SelectField
            label="Size"
            placeholder="Choose a size"
            options={SIZE_LABELS.map((s) => ({ value: s, label: sizeLabel[s] ?? s }))}
            {...form.register("sizeLabel")}
            error={err("sizeLabel")}
          />
        </div>
        <TextAreaField
          label="Description"
          rows={5}
          hint="Where and when it was worn, what is included (dupatta, stole, safa), and how it fits."
          {...form.register("description")}
          error={err("description")}
        />
        <fieldset>
          <legend className="eyebrow text-graphite">Occasions it suits</legend>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            {OCCASIONS.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={o}
                  {...form.register("occasions")}
                  className="size-4 accent-burgundy"
                />
                {occasionLabel[o]}
              </label>
            ))}
          </div>
          {err("occasions") ? <p className="mt-2 text-caption text-danger">{err("occasions")}</p> : null}
        </fieldset>
        <SelectField
          label="Condition"
          options={CONDITION_GRADES.map((c) => ({ value: c, label: conditionLabel[c] ?? c }))}
          {...form.register("conditionGrade")}
          error={err("conditionGrade")}
        />
      </Fieldset>

      <Fieldset
        legend="Rental price"
        description={`Set a price for each length of rental you offer; leave the others empty. Peti keeps ${marketplacePolicy.commissionBps / 100}% of the rental fee on rentals that go ahead.`}
      >
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {marketplacePolicy.durationOptionsDays.map((d) => (
            <TextField
              key={d}
              label={`${d} days`}
              optional
              prefix="₹"
              inputMode="numeric"
              {...form.register(`price${d}` as "price3")}
              error={err(`price${d}`)}
            />
          ))}
        </div>
        {err("prices") ? <p className="text-caption text-danger">{err("prices")}</p> : null}
        {lowest && earnPaise !== null ? (
          <p className="text-sm text-graphite" aria-live="polite">
            For {lowest.days} days you would receive{" "}
            <strong className="text-ink numeral">{formatInr(earnPaise)}</strong> after Peti&rsquo;s fee.
          </p>
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          <TextField
            label="What it cost new"
            prefix="₹"
            inputMode="numeric"
            hint="The original purchase price. It caps the deposit and protects you if the outfit is damaged."
            {...form.register("retailValueRupees")}
            error={err("retailValueRupees")}
          />
          <TextField
            label="Refundable deposit"
            prefix="₹"
            inputMode="numeric"
            hint={
              retail
                ? `At least ₹${marketplacePolicy.depositMinPaise / 100}. Owners often ask 20–30% of the value: ${formatInr(retail * 20)}–${formatInr(retail * 30)}.`
                : `At least ₹${marketplacePolicy.depositMinPaise / 100}; 20–30% of what it cost new is common.`
            }
            {...form.register("depositRupees")}
            error={err("depositRupees")}
          />
        </div>
      </Fieldset>

      <Fieldset
        legend="Where it is"
        description="Peti is in Ahmedabad for now. Renters see the locality only; the address is shared once a booking is paid."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <SelectField
            label="Pickup address"
            placeholder="Choose an address"
            options={addresses.map((a) => ({ value: a.id, label: a.name }))}
            {...form.register("pickupAddressId", {
              onChange: (e: { target: { value: string } }) => {
                const match = addresses.find((a) => a.id === e.target.value);
                if (match && !form.getValues("localityId")) form.setValue("localityId", match.localityId);
              },
            })}
            error={err("pickupAddressId")}
          />
          <SelectField
            label="Locality shown to renters"
            placeholder="Choose a locality"
            options={localities.map((l) => ({ value: l.id, label: l.name }))}
            {...form.register("localityId")}
            error={err("localityId")}
          />
        </div>
      </Fieldset>

      <details open={moreHasError || undefined} className="group border-t border-ink pt-6">
        <summary className="cursor-pointer list-none">
          <span className="font-display text-2xl">More about the outfit</span>{" "}
          <span className="eyebrow text-graphite">Optional</span>
          <span className="mt-1 block text-sm text-graphite">
            Colour, fabric, label, condition notes, measurements and cleaning time. Renters filter by
            measurements, so they help your outfit get found.
          </span>
        </summary>
        <div className="mt-8 grid gap-10">
          <div className="grid gap-6 md:grid-cols-3">
            <TextField label="Colour" optional {...form.register("colour")} error={err("colour")} />
            <TextField label="Fabric" optional {...form.register("fabric")} error={err("fabric")} />
            <TextField label="Designer or label" optional {...form.register("brand")} error={err("brand")} />
          </div>
          <TextAreaField
            label="Condition notes"
            optional
            rows={3}
            hint="Any marks, pulls, missing beads or alterations. Handovers are checked against this."
            {...form.register("conditionNotes")}
            error={err("conditionNotes")}
          />
          <Fieldset legend="Measurements" description="Measure the garment itself, flat, in centimetres.">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {MEASUREMENT_FIELDS.map((f) => (
                <TextField
                  key={f}
                  label={measurementLabel[f] ?? f}
                  optional
                  inputMode="decimal"
                  {...form.register(f)}
                  error={err(f)}
                />
              ))}
            </div>
            <TextField
              label="Fit notes"
              optional
              {...form.register("measurementNotes")}
              error={err("measurementNotes")}
            />
          </Fieldset>
          <div className="max-w-xs">
            <SelectField
              label="Cleaning days after each rental"
              options={Array.from({ length: marketplacePolicy.turnaroundDaysMax + 1 }, (_, n) => ({
                value: String(n),
                label: n === 1 ? "1 day" : `${n} days`,
              }))}
              {...form.register("turnaroundDays")}
              error={err("turnaroundDays")}
            />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4 border-t border-ink pt-6">
        <Button type="submit" size="lg" pending={isSubmitting}>
          {submitLabel}
        </Button>
        <p className="text-sm text-graphite">{nextStepNote}</p>
      </div>
    </form>
  );
}
