import { describe, expect, it } from "vitest";
import { ConcurrencyError } from "@/shared/domain/errors";
import { DataIntegrityError, extractPgError, mapDatabaseError } from "@/shared/infrastructure/pg-error";

// Shape observed from Prisma 7 + @prisma/adapter-pg (see tests/integration/database/guards.test.ts).
const prismaAdapterError = (code: string, message: string) => ({
  code: "P2039",
  meta: {
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: { originalCode: code, originalMessage: message, kind: "postgres", code, message },
    },
  },
});

describe("extractPgError", () => {
  it("reads SQLSTATE and constraint from a wrapped driver adapter error", () => {
    const info = extractPgError(
      prismaAdapterError(
        "23P01",
        'conflicting key value violates exclusion constraint "calendar_holds_no_overlap"',
      ),
    );
    expect(info).toMatchObject({ sqlState: "23P01", constraint: "calendar_holds_no_overlap" });
  });

  it("reads the constraint name prefixed by our triggers", () => {
    const info = extractPgError(
      prismaAdapterError("23514", "bookings_legal_transition: illegal booking transition A -> B"),
    );
    expect(info).toMatchObject({ sqlState: "23514", constraint: "bookings_legal_transition" });
  });

  it("ignores Prisma's own P-codes", () => {
    expect(extractPgError({ code: "P2025", message: "Record not found" })).toBeNull();
  });
});

describe("mapDatabaseError", () => {
  it("maps deadlocks to a concurrency error and unknown constraint violations to an integrity error", () => {
    expect(mapDatabaseError(prismaAdapterError("40P01", "deadlock detected"))).toBeInstanceOf(
      ConcurrencyError,
    );
    expect(
      mapDatabaseError(prismaAdapterError("23505", 'duplicate key value violates unique constraint "x"')),
    ).toBeInstanceOf(DataIntegrityError);
  });

  it("passes through errors that are not from Postgres", () => {
    const error = new Error("network down");
    expect(mapDatabaseError(error)).toBe(error);
  });
});
