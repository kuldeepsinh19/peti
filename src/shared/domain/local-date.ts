/**
 * A calendar day with no time or zone, as "YYYY-MM-DD". Rentals are whole days in Asia/Kolkata;
 * using a string value object avoids the classic off-by-one bugs of JS Dates at UTC midnight.
 */
declare const localDateBrand: unique symbol;
export type LocalDate = string & { readonly [localDateBrand]: "LocalDate" };

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`Not a valid calendar date: ${value}`);
    this.name = "InvalidDateError";
  }
}

function toUtcMs(value: string): number {
  const m = PATTERN.exec(value);
  if (!m) throw new InvalidDateError(value);
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    throw new InvalidDateError(value);
  }
  return ms;
}

export function localDate(value: string): LocalDate {
  toUtcMs(value);
  return value as LocalDate;
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string") return false;
  try {
    toUtcMs(value);
    return true;
  } catch {
    return false;
  }
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10) as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const IST_OFFSET_MINUTES = 330;

/** The calendar day in Asia/Kolkata at the given instant. India has no daylight saving time. */
export function localDateInIndia(instant: Date): LocalDate {
  // Shift into IST, then read the UTC calendar date of the shifted instant.
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10) as LocalDate;
}

/** The instant at which the given day begins (00:00) in Asia/Kolkata. */
export function startOfDayInIndia(date: LocalDate): Date {
  return new Date(toUtcMs(date) - IST_OFFSET_MINUTES * 60_000);
}

/** Prisma returns `@db.Date` columns as Dates at UTC midnight. */
export function localDateFromDb(value: Date): LocalDate {
  return fromUtcMs(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function localDateToDb(date: LocalDate): Date {
  return new Date(toUtcMs(date));
}

const displayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "12 Dec 2026" */
export function formatLocalDate(date: LocalDate): string {
  return displayFormat.format(new Date(toUtcMs(date)));
}
