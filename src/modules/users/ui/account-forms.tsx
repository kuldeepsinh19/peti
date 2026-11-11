"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/contracts/action-result";
import { Button } from "@/shared/ui/button";
import { CheckboxField, FormMessage, SelectField, TextAreaField, TextField } from "@/shared/ui/form";
import { addressSchema, updateProfileSchema } from "../application/contracts";

type Action<T = undefined> = (input: unknown) => Promise<ActionResult<T>>;

/** Applies server-side field errors from an ActionResult onto a react-hook-form instance. */
function applyResult<T>(
  result: ActionResult<T>,
  setError: (name: never, error: { message: string }) => void,
  setFormError: (message: string | null) => void,
): boolean {
  if (result.ok) return true;
  for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
    setError(field as never, { message: messages[0] ?? "Invalid value." });
  }
  setFormError(result.error.message);
  return false;
}

export function ProfileForm({
  defaults,
  action,
}: {
  defaults: { displayName: string; bio: string | null };
  action: Action;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<z.input<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { displayName: defaults.displayName, bio: defaults.bio ?? "" },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(false);
    setFormError(null);
    if (applyResult(await action(values), form.setError as never, setFormError)) setSaved(true);
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-7">
      <FormMessage>{formError}</FormMessage>
      {saved ? <FormMessage tone="success">Profile saved.</FormMessage> : null}
      <TextField
        label="Display name"
        hint="Shown on your listings and reviews."
        {...form.register("displayName")}
        error={errors.displayName?.message}
      />
      <TextAreaField
        label="About you"
        optional
        rows={3}
        hint="A line or two — for example, how you look after your outfits."
        {...form.register("bio")}
        error={errors.bio?.message}
      />
      <div>
        <Button type="submit" pending={isSubmitting}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function AddressForm({
  localities,
  action,
}: {
  localities: ReadonlyArray<{ id: string; name: string }>;
  action: Action<{ id: string }>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof addressSchema>>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: "",
      line1: "",
      line2: "",
      landmark: "",
      localityId: "",
      pincode: "",
      isDefault: false,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    if (applyResult(await action(values), form.setError as never, setFormError)) form.reset();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <FormMessage>{formError}</FormMessage>
      </div>
      <TextField
        label="Label"
        optional
        placeholder="Home, office…"
        {...form.register("label")}
        error={errors.label?.message}
      />
      <SelectField
        label="Locality"
        placeholder="Choose a locality"
        options={localities.map((l) => ({ value: l.id, label: l.name }))}
        {...form.register("localityId")}
        error={errors.localityId?.message}
      />
      <TextField
        label="Address line 1"
        containerClassName="md:col-span-2"
        {...form.register("line1")}
        error={errors.line1?.message}
      />
      <TextField
        label="Address line 2"
        optional
        containerClassName="md:col-span-2"
        {...form.register("line2")}
        error={errors.line2?.message}
      />
      <TextField label="Landmark" optional {...form.register("landmark")} error={errors.landmark?.message} />
      <TextField
        label="PIN code"
        inputMode="numeric"
        maxLength={6}
        {...form.register("pincode")}
        error={errors.pincode?.message}
      />
      <CheckboxField
        label="Use as my default pickup address"
        className="md:col-span-2"
        {...form.register("isDefault")}
      />
      <div className="md:col-span-2">
        <Button type="submit" pending={isSubmitting}>
          Add address
        </Button>
      </div>
    </form>
  );
}
