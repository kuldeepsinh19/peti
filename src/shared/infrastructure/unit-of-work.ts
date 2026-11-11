import "server-only";
import type { UnitOfWork } from "../application/unit-of-work";
import { extractPgError, isRetryable, mapDatabaseError } from "./pg-error";
import type { Db, Tx } from "./prisma";

const MAX_ATTEMPTS = 3;

/**
 * Interactive transaction at READ COMMITTED (ADR-004: the exclusion constraint guarantees correctness;
 * Serializable is not needed). Deadlocks and serialization failures are retried a bounded number of
 * times, then surfaced as ConcurrencyError. Other database errors are mapped to domain errors.
 */
export function prismaUnitOfWork<R>(db: Db, build: (tx: Tx) => R): UnitOfWork<R> {
  return {
    async run<T>(work: (repos: R) => Promise<T>): Promise<T> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await db.$transaction((tx) => work(build(tx)), { maxWait: 5_000, timeout: 15_000 });
        } catch (error) {
          if (attempt < MAX_ATTEMPTS && isRetryable(extractPgError(error))) continue;
          throw mapDatabaseError(error);
        }
      }
    },
  };
}
