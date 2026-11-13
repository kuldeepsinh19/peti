"use client";

import { DayPicker } from "@daypicker/react";
import "@daypicker/react/style.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ActionResult } from "@/shared/contracts/action-result";
import { formatInr } from "@/shared/domain/money";
import { Button } from "@/shared/ui/button";
import { CheckboxField, FormMessage, TextAreaField } from "@/shared/ui/form";
import { DefinitionList } from "@/shared/ui/layout";

const DAY = 86_400_000;
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

export interface RequestFormProps {
  outfitId: string;
  prices: Array<{ durationDays: number; pricePaise: number }>;
  depositPaise: number;
  turnaroundDays: number;
  /** Half-open ranges already held on the outfit's calendar. */
  unavailable: Array<{ startsOn: string; endsBefore: string }>;
  earliestStart: string;
  latestStart: string;
  action: (input: unknown) => Promise<ActionResult<{ redirectTo: string }>>;
}

/**
 * Date and duration picker with a live price breakdown. Everything here is a preview: the server
 * recomputes the price and checks availability, and the owner's approval is what holds the dates.
 */
export function RequestForm({
  outfitId,
  prices,
  depositPaise,
  turnaroundDays,
  unavailable,
  earliestStart,
  latestStart,
  action,
}: RequestFormProps) {
  const router = useRouter();
  const [days, setDays] = useState(prices[0]?.durationDays ?? 3);
  const [start, setStart] = useState<Date | undefined>();
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const blocked = useMemo(
    () =>
      unavailable.map((r) => ({
        from: fromIso(r.startsOn),
        to: new Date(fromIso(r.endsBefore).getTime() - DAY),
      })),
    [unavailable],
  );
  // A start date is impossible if the rental plus cleaning days would run into an existing hold.
  const clashes = (date: Date) => {
    const end = new Date(date.getTime() + (days + turnaroundDays) * DAY);
    return unavailable.some((r) => fromIso(r.startsOn) < end && fromIso(r.endsBefore) > date);
  };
  const price = prices.find((p) => p.durationDays === days)?.pricePaise ?? 0;
  const end = start ? new Date(start.getTime() + (days - 1) * DAY) : null;
  const dateText = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  async function submit() {
    if (!start) {
      setError("Choose a start date.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await action({ outfitId, startDate: toIso(start), days, note, acceptTerms: accepted });
      if (!result.ok) {
        setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        setPending(false);
        return;
      }
      // Stay pending while navigating, so a second click cannot send a second request.
      router.push(result.data.redirectTo);
    } catch {
      setError("That did not reach Peti. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <fieldset>
          <legend className="eyebrow text-graphite">How long</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {prices.map((p) => (
              <label
                key={p.durationDays}
                className={`cursor-pointer border px-4 py-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${p.durationDays === days ? "border-burgundy bg-burgundy text-paper" : "border-ink"}`}
              >
                <input
                  type="radio"
                  name="days"
                  value={p.durationDays}
                  checked={p.durationDays === days}
                  onChange={() => {
                    setDays(p.durationDays);
                    setStart(undefined);
                  }}
                  className="sr-only"
                />
                {p.durationDays} days · {formatInr(p.pricePaise)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <p className="eyebrow text-graphite">Start date</p>
          <DayPicker
            mode="single"
            selected={start}
            onSelect={setStart}
            startMonth={fromIso(earliestStart)}
            endMonth={fromIso(latestStart)}
            disabled={[
              { before: fromIso(earliestStart) },
              { after: fromIso(latestStart) },
              ...blocked,
              clashes,
            ]}
            modifiers={{ held: blocked }}
            modifiersClassNames={{ held: "line-through opacity-60" }}
            className="peti-calendar mt-3"
          />
          <p className="text-caption text-stone">
            Struck-out dates are already booked or blocked by the owner. {turnaroundDays} cleaning day
            {turnaroundDays === 1 ? " follows" : "s follow"} every rental.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <DefinitionList
          items={[
            {
              term: "Dates",
              value: start && end ? `${dateText(start)} – ${dateText(end)}` : "Choose a start date",
            },
            { term: `Rental fee (${days} days)`, value: formatInr(price) },
            { term: "Refundable deposit", value: formatInr(depositPaise) },
            {
              term: "Total to pay once approved",
              value: <strong className="numeral">{formatInr(price + depositPaise)}</strong>,
            },
          ]}
        />
        <TextAreaField
          label="A note for the owner"
          optional
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint="For example, the occasion and how you would like to collect it."
        />
        <CheckboxField
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          label={
            <>
              I accept the <Link href="/terms">rental terms</Link>, the{" "}
              <Link href="/how-it-works#cancelling">cancellation policy</Link> and the{" "}
              <Link href="/trust-and-safety#deposits">deposit and damage rules</Link>.
            </>
          }
        />
        <FormMessage>{error}</FormMessage>
        <div>
          <Button size="lg" onClick={submit} pending={pending} disabled={!start || !accepted}>
            Send request
          </Button>
        </div>
        <p className="text-caption text-stone">
          Nothing is charged now. If the owner accepts, you will have up to 12 hours to pay, and the dates are
          held for you meanwhile.
        </p>
      </div>
    </div>
  );
}
