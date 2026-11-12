"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { FormMessage } from "@/shared/ui/form";
import { completeSandboxCheckout } from "./actions";

const OUTCOMES = [
  { value: "pay", label: "Pay — callback and webhook", note: "The normal path." },
  { value: "pay-webhook-only", label: "Pay — webhook only", note: "As if the renter closed the browser." },
  { value: "pay-callback-only", label: "Pay — callback only", note: "As if the webhook were delayed." },
  { value: "pay-duplicate-webhook", label: "Pay — webhook delivered twice", note: "Tests idempotency." },
  { value: "fail", label: "Payment fails", note: "The booking stays awaiting payment." },
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
        router.push(bookingUrl);
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
