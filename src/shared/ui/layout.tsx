import type { ElementType, ReactNode } from "react";
import { cn } from "./cn";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-page page-x", className)}>{children}</div>;
}

/** "01 — Sherwanis": numbered section label in small caps with a brass numeral. */
export function SectionIndex({
  index,
  children,
  className,
}: {
  index?: number | string;
  children: ReactNode;
  className?: string;
}) {
  const label = typeof index === "number" ? String(index).padStart(2, "0") : index;
  return (
    <p className={cn("flex items-center gap-3 eyebrow text-graphite", className)}>
      {label ? <span className="whitespace-nowrap text-brass-deep numeral">{label}</span> : null}
      {label ? <span aria-hidden className="h-px w-8 bg-rule-strong" /> : null}
      <span>{children}</span>
    </p>
  );
}

export function Rule({ className, strong }: { className?: string; strong?: boolean }) {
  return <hr className={cn("border-0 border-t", strong ? "border-ink" : "border-rule", className)} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("eyebrow text-graphite", className)}>{children}</p>;
}

/** Page title block used across account, lending and admin areas. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  as: Heading = "h1",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  as?: ElementType;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-ink pt-10 pb-8 md:flex-row md:items-end md:justify-between md:pt-16">
      <div className="flex max-w-3xl flex-col gap-3">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading className="text-display-md">{title}</Heading>
        {lede ? <p className="max-w-prose text-lg text-graphite">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}

/** Label / value pairs laid out like a colophon. */
export function DefinitionList({
  items,
  className,
}: {
  items: ReadonlyArray<{ term: ReactNode; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-rule border-y border-rule", className)}>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-4 py-3">
          <dt className="pt-0.5 eyebrow text-graphite">{item.term}</dt>
          <dd className="text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
