import { describe, expect, it } from "vitest";
import {
  InvalidDateError,
  addDays,
  daysBetween,
  formatLocalDate,
  localDate,
  localDateFromDb,
  localDateInIndia,
  localDateToDb,
  startOfDayInIndia,
} from "@/shared/domain/local-date";

describe("LocalDate", () => {
  it("rejects impossible dates", () => {
    expect(() => localDate("2027-02-29")).toThrow(InvalidDateError);
    expect(() => localDate("2027-13-01")).toThrow(InvalidDateError);
    expect(() => localDate("12/01/2027")).toThrow(InvalidDateError);
    expect(localDate("2028-02-29")).toBe("2028-02-29");
  });

  it("does day arithmetic across month and year ends", () => {
    expect(addDays(localDate("2026-12-30"), 3)).toBe("2027-01-02");
    expect(addDays(localDate("2027-03-01"), -1)).toBe("2027-02-28");
    expect(daysBetween(localDate("2026-12-30"), localDate("2027-01-02"))).toBe(3);
  });

  it("computes today in India, not in UTC", () => {
    // 20:00 UTC on 31 Dec is 01:30 IST on 1 Jan.
    expect(localDateInIndia(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    // 18:29:59 UTC is still 23:59:59 IST the same day.
    expect(localDateInIndia(new Date("2026-12-31T18:29:59Z"))).toBe("2026-12-31");
  });

  it("knows when a day starts in India", () => {
    expect(startOfDayInIndia(localDate("2027-01-01")).toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("round-trips through the database representation", () => {
    const d = localDate("2027-01-15");
    expect(localDateFromDb(localDateToDb(d))).toBe(d);
  });

  it("formats for display", () => {
    expect(formatLocalDate(localDate("2027-01-05"))).toBe("5 Jan 2027");
  });
});
