"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { marketplacePolicy } from "@/config/marketplace-policy";
import type { ActionResult } from "@/shared/contracts/action-result";
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
  action: (input: unknown) => Promise<ActionResult<{ redirectTo: string; message?: string }>>;
}

/** Create and edit form for a listing. The same Zod contract validates here and again on the server. */
export function ListingForm({
  categories,
  localities,
  addresses,
  defaults,
  submitLabel,
  action,
}: ListingFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: { turnaroundDays: marketplacePolicy.turnaroundDaysDefault, occasions: [], ...defaults },
  });
  const { errors, isSubmitting } = form.formState;
  const err = (name: string) => (errors as Record<string, { message?: string } | undefined>)[name]?.message;

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
      <FormMessage>
        Add a pickup address first — <Link href="/account/addresses">add an address</Link>. Renters only ever
        see the locality.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-12">
      <FormMessage>{formError}</FormMessage>

      <Fieldset legend="The outfit">
        <TextField
          label="Title"
          placeholder="Ivory thread-work sherwani"
          {...form.register("title")}
          error={err("title")}
        />
        <TextAreaField
          label="Description"
          rows={5}
          hint="Where and when it was worn, what is included (dupatta, stole, safa), and how it fits."
          {...form.register("description")}
          error={err("description")}
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
          <TextField label="Colour" optional {...form.register("colour")} error={err("colour")} />
          <TextField label="Fabric" optional {...form.register("fabric")} error={err("fabric")} />
          <TextField label="Designer or label" optional {...form.register("brand")} error={err("brand")} />
        </div>
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
      </Fieldset>

      <Fieldset
        legend="Condition"
        description="Be precise: this is the baseline every handover is checked against."
      >
        <SelectField
          label="Condition"
          placeholder="Choose a condition"
          options={CONDITION_GRADES.map((c) => ({ value: c, label: conditionLabel[c] ?? c }))}
          {...form.register("conditionGrade")}
          error={err("conditionGrade")}
        />
        <TextAreaField
          label="Condition notes"
          rows={3}
          hint="List any marks, pulls, missing beads or alterations."
          {...form.register("conditionNotes")}
          error={err("conditionNotes")}
        />
      </Fieldset>

      <Fieldset
        legend="Measurements"
        description="Measure the garment itself, flat, in centimetres. Renters filter by these numbers."
      >
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

      <Fieldset
        legend="Prices and deposit"
        description={`Set a price for each duration you offer. Peti keeps ${marketplacePolicy.commissionBps / 100}% of the rental fee on rentals that go ahead.`}
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
        <div className="grid gap-6 md:grid-cols-3">
          <TextField
            label="Retail value"
            prefix="₹"
            inputMode="numeric"
            hint="What it cost new."
            {...form.register("retailValueRupees")}
            error={err("retailValueRupees")}
          />
          <TextField
            label="Refundable deposit"
            prefix="₹"
            inputMode="numeric"
            hint={`At least ₹${marketplacePolicy.depositMinPaise / 100}; 20–30% of retail is common.`}
            {...form.register("depositRupees")}
            error={err("depositRupees")}
          />
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
      </Fieldset>

      <Fieldset
        legend="Where it is"
        description="Renters see the locality only; the address is shared once a booking is paid."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <SelectField
            label="Locality shown on the listing"
            placeholder="Choose a locality"
            options={localities.map((l) => ({ value: l.id, label: l.name }))}
            {...form.register("localityId")}
            error={err("localityId")}
          />
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
        </div>
      </Fieldset>

      <div className="flex flex-wrap items-center gap-4 border-t border-ink pt-6">
        <Button type="submit" size="lg" pending={isSubmitting}>
          {submitLabel}
        </Button>
        <p className="text-sm text-graphite">
          You can add photographs and submit for review on the next step.
        </p>
      </div>
    </form>
  );
}
