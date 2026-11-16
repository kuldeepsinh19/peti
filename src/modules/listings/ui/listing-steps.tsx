import Link from "next/link";
import { cn } from "@/shared/ui/cn";

export type ListingStep = "details" | "photos" | "preview";

const STEPS: ReadonlyArray<{ step: ListingStep; label: string }> = [
  { step: "details", label: "Details" },
  { step: "photos", label: "Photographs" },
  { step: "preview", label: "Preview & submit" },
];

/**
 * Where the owner is in listing an outfit. Before the draft exists only the first step is reachable; after
 * that every step is a link, so the owner can go back and change anything before submitting.
 */
export function ListingSteps({ current, outfitId }: { current: ListingStep; outfitId?: string }) {
  const href = (step: ListingStep) =>
    !outfitId
      ? null
      : step === "details"
        ? `/lend/outfits/${outfitId}/edit`
        : `/lend/outfits/${outfitId}/${step}`;
  return (
    <nav aria-label="Listing steps" className="mt-8">
      <ol className="grid grid-cols-3 border-t border-ink">
        {STEPS.map(({ step, label }, i) => {
          const active = step === current;
          const target = href(step);
          const body = (
            <>
              <span className="eyebrow text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("text-sm", active ? "text-ink" : "text-graphite")}>{label}</span>
            </>
          );
          return (
            <li
              key={step}
              className={cn("border-t-2 pt-3", active ? "border-burgundy" : "border-transparent")}
            >
              {target && !active ? (
                <Link href={target} className="flex flex-col gap-1 no-underline hover:text-ink">
                  {body}
                </Link>
              ) : (
                <span className="flex flex-col gap-1" aria-current={active ? "step" : undefined}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
