import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "olive";

const toneClasses: Record<Tone, string> = {
  neutral: "border-rule-strong text-graphite",
  brand: "border-burgundy text-burgundy",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
  olive: "border-olive text-olive-deep",
};

/** Square, outlined small-caps tag for statuses. Never colour alone: the text always carries meaning. */
export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 eyebrow whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      className={cn("border-l-2 bg-ivory px-4 py-3 text-sm", toneClasses[tone], className)}
    >
      {title ? <p className="font-medium text-ink">{title}</p> : null}
      {children ? <div className="mt-1 text-graphite">{children}</div> : null}
    </div>
  );
}

/** Empty states read like an editor's note: a serif line, a sentence, and at most one action. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-4 border-y border-rule py-12", className)}>
      <p className="display-italic text-display-sm text-graphite">{title}</p>
      {children ? <div className="max-w-prose text-graphite">{children}</div> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse bg-sand/70", className)} />;
}

/** Loading placeholder for a grid of listings, matching the 3:4 image rhythm. */
export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading outfits"
      className="grid grid-cols-2 gap-x-(--spacing-gutter) gap-y-10 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="aspect-[3/4] w-full" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ))}
    </div>
  );
}
