"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { FormMessage } from "@/shared/ui/form";
import { completeSandboxCheckout } from "./actions";

// Plain-language outcomes first; the technical detail (what the provider sends) is the note.
const OUTCOMES = [
  {
    value: "pay",
    label: "Pay",
    note: "The usual case: you come back to Peti and the provider confirms in the background (callback and webhook).",
  },
  {
    value: "fail",
    label: "Card declined",
    note: "Nothing is taken; the booking keeps waiting for payment (no callback, a failure webhook).",
  },
  {
    value: "pay-webhook-only",
    label: "Pay, then close the tab",
    note: "Only the background confirmation arrives (webhook only).",
  },
  {
    value: "pay-callback-only",
    label: "Pay, confirmation delayed",
    note: "You come back to Peti before the provider confirms (callback only).",
  },
  {
    value: "pay-duplicate-webhook",
    label: "Pay, confirmation sent twice",
    note: "The webhook is delivered twice; Peti applies it once.",
  },
  {
    value: "pay-twice",
    label: "Pay twice",
    note: "Two authorisations on one order: Peti captures one and leaves the other to be released.",
  },
  {
    value: "pay-captured",
    label: "Captured outside Peti",
    note: "As if captured from the provider dashboard: confirmed, or refunded if it is a second payment.",
  },
  {
    value: "pay-wrong-amount",
    label: "Pay the wrong amount",
    note: "Never captured: the booking keeps waiting for payment.",
  },
] as const;

export function CheckoutPanel({ orderId, bookingUrl }: { orderId: string; bookingUrl: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [callback, setCallback] = useState<{ fields: Record<string, string>; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(outcome: string) {
    setBusy(outcome);
    setError(null);
    try {
      const result = await completeSandboxCheckout(orderId, outcome);
      if (result.callback) {
        setCallback({ fields: result.callback, url: result.callbackUrl });
        // Submit the signed callback as a real form POST, like a provider's checkout page does.
        requestAnimationFrame(() => formRef.current?.submit());
      } else {
        router.push(outcome === "fail" ? `${bookingUrl}?payment=failed` : bookingUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage>{error}</FormMessage>
      <ul className="border-t border-ink">
        {OUTCOMES.map((o) => (
          <li
            key={o.value}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4"
          >
            <div>
              <p className="font-display text-xl">{o.label}</p>
              <p className="text-sm text-graphite">{o.note}</p>
            </div>
            <Button
              variant={o.value === "pay" ? "primary" : "secondary"}
              pending={busy === o.value}
              disabled={busy !== null}
              onClick={() => choose(o.value)}
            >
              {o.value === "fail" ? "Decline" : "Pay"}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="quiet" onClick={() => router.push(bookingUrl)} disabled={busy !== null}>
        Abandon checkout
      </Button>
      {callback ? (
        <form ref={formRef} method="post" action={callback.url} className="hidden">
          {Object.entries(callback.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      ) : null}
    </div>
  );
}
