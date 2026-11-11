import type { ReactNode } from "react";
import { cn } from "./cn";

/*
 * Ledger tables for owner and admin areas: hairline rows, small-caps headers, numerals aligned right.
 * On narrow screens each row collapses into a stacked block, using the column header as a label.
 */
export interface LedgerColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function Ledger<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
}: {
  columns: ReadonlyArray<LedgerColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  caption?: ReactNode;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <table className="w-full border-collapse text-sm">
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-ink">
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={cn(
                "py-3 pr-4 eyebrow font-medium text-graphite",
                c.align === "right" ? "text-right" : "text-left",
              )}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="block border-b border-rule py-3 md:table-row md:py-0">
            {columns.map((c) => (
              <td
                key={c.key}
                className={cn(
                  "flex justify-between gap-4 py-1 md:table-cell md:py-3.5 md:pr-4 md:align-top",
                  c.align === "right" ? "numeral md:text-right" : "",
                  c.className,
                )}
              >
                <span className="eyebrow text-stone md:hidden">{c.header}</span>
                <span>{c.cell(row)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
