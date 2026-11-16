"use client";

import { DayPicker } from "@daypicker/react";
import "@daypicker/react/style.css";

const DAY = 86_400_000;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

/**
 * Read-only availability for a renter deciding whether to request: booked and blocked days are struck out.
 * It shows what is held, not why (another renter's booking is never revealed). Choosing dates happens on
 * the request page, which applies the same holds plus the rental length and cleaning days.
 */
export function AvailabilityCalendar({
  unavailable,
  earliestStart,
  latestStart,
  turnaroundDays,
}: {
  unavailable: ReadonlyArray<{ startsOn: string; endsBefore: string }>;
  earliestStart: string;
  latestStart: string;
  turnaroundDays: number;
}) {
  const held = unavailable.map((r) => ({
    from: fromIso(r.startsOn),
    to: new Date(fromIso(r.endsBefore).getTime() - DAY),
  }));
  return (
    <div>
      <DayPicker
        mode="single"
        numberOfMonths={1}
        startMonth={fromIso(earliestStart)}
        endMonth={fromIso(latestStart)}
        disabled={[{ before: fromIso(earliestStart) }, { after: fromIso(latestStart) }, ...held]}
        modifiers={{ held }}
        modifiersClassNames={{ held: "line-through opacity-60" }}
        className="peti-calendar mt-3"
        aria-label="Availability"
      />
      <p className="text-caption text-stone">
        Struck-out dates are booked or blocked by the owner. {turnaroundDays} cleaning day
        {turnaroundDays === 1 ? " follows" : "s follow"} every rental, so a start date also needs those days
        free. Pick your dates when you request.
      </p>
    </div>
  );
}
