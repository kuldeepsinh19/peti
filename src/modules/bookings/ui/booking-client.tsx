"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionResult } from "@/shared/contracts/action-result";
import { Button } from "@/shared/ui/button";
import { downscaleImage } from "@/shared/ui/downscale-image";
import { FormMessage, SelectField, TextAreaField, TextField } from "@/shared/ui/form";

type CheckoutSession =
  | { mode: "REDIRECT"; url: string }
  | { mode: "CLIENT_SDK"; scriptUrl: string; publicConfig: Readonly<Record<string, unknown>> };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment page."));
    document.body.appendChild(s);
  });
}

const CONNECTION_ERROR = "That did not reach Peti. Check your connection and try again.";
/** Stays under the smallest request limit we deploy behind (Vercel functions accept 4.5 MB). */
const MAX_REPORT_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Starts checkout. The booking is confirmed only after the provider confirms the payment to the server. */
export function PayButton({
  label,
  start,
}: {
  label: string;
  start: () => Promise<ActionResult<CheckoutSession>>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setPending(true);
    setError(null);
    try {
      const result = await start();
      if (!result.ok) {
        setError(result.error.message);
        setPending(false);
        return;
      }
      const session = result.data;
      if (session.mode === "REDIRECT") {
        window.location.assign(session.url); // stay pending while the browser leaves the page
        return;
      }
      await loadScript(session.scriptUrl);
      if (!window.Razorpay) throw new Error("The payment page did not load.");
      new window.Razorpay({ ...session.publicConfig }).open();
      setPending(false);
    } catch {
      setError(CONNECTION_ERROR);
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" onClick={pay} pending={pending}>
        {label}
      </Button>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

/** Handover or return report: grade, notes and at least the required number of photographs. */
export function ConditionReportForm({
  bookingId,
  kind,
  minPhotos,
  submit,
  showReturnDate,
}: {
  bookingId: string;
  kind: "HANDOVER" | "RETURN";
  minPhotos: number;
  submit: (formData: FormData) => Promise<ActionResult<undefined>>;
  showReturnDate?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const files = data.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length < minPhotos) {
      setError(`Add at least ${minPhotos} photographs.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Shrink phone photos first so several of them fit in one request.
      const shrunk = await Promise.all(files.map((f) => downscaleImage(f)));
      const total = shrunk.reduce((sum, f) => sum + f.size, 0);
      if (total > MAX_REPORT_UPLOAD_BYTES) {
        setError(
          `These photographs add up to ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_REPORT_UPLOAD_BYTES / 1024 / 1024} MB. Use fewer or smaller photographs.`,
        );
        return;
      }
      data.delete("photos");
      for (const file of shrunk) data.append("photos", file);
      const result = await submit(data);
      if (!result.ok) {
        setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      router.refresh();
    } catch {
      // A rejected Server Action (lost connection, request too large) must not leave the form spinning.
      setError(CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-6" encType="multipart/form-data">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="kind" value={kind} />
      <FormMessage>{error}</FormMessage>
      <SelectField
        label="Condition"
        name="grade"
        defaultValue="EXCELLENT"
        options={[
          { value: "NEW_WITH_TAGS", label: "New, with tags" },
          { value: "EXCELLENT", label: "Excellent" },
          { value: "GOOD", label: "Good" },
          { value: "FAIR", label: "Fair" },
        ]}
      />
      <TextAreaField
        label="Notes"
        name="notes"
        rows={3}
        required
        hint="Note anything a renter or reviewer should see: marks, pieces included."
      />
      {showReturnDate ? (
        <TextField label="Returned on" name="returnedOn" type="date" hint="Leave blank for today." />
      ) : null}
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-graphite">Photographs (at least {minPhotos})</span>
        <input
          type="file"
          name="photos"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="text-sm"
        />
      </label>
      <div>
        <Button type="submit" pending={pending}>
          {kind === "HANDOVER" ? "Record handover" : "Record return"}
        </Button>
      </div>
    </form>
  );
}
