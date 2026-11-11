import { ConcurrencyError, ConflictError, DomainError } from "../domain/errors";

/**
 * Postgres errors reach us wrapped differently depending on whether the query came from the Prisma
 * query engine, a raw query or the pg driver adapter. This digs out the SQLSTATE and constraint name
 * wherever they are, so every caller can rely on one shape.
 */
export interface PgErrorInfo {
  sqlState: string;
  constraint?: string;
  message: string;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * Prisma's pg adapter keeps the SQLSTATE but drops the driver's `constraint` field, so the name is read
 * from the message: `violates check constraint "name"` for declarative constraints, and a `name:` prefix
 * for errors raised by our triggers (see the trigger_error_names migration).
 */
function constraintFromMessage(text: string): string | undefined {
  return /constraint "([a-z0-9_]+)"/i.exec(text)?.[1] ?? /^([a-z][a-z0-9_]+): /.exec(text)?.[1];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function extractPgError(error: unknown): PgErrorInfo | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0) {
    const current = queue.shift();
    const record = asRecord(current);
    if (!record || seen.has(current)) continue;
    seen.add(current);
    const meta = asRecord(record.meta);

    const code = [record.code, record.originalCode, meta?.code].find(
      (c): c is string => typeof c === "string" && SQLSTATE.test(c) && !c.startsWith("P"),
    );
    if (code) {
      const text =
        [record.originalMessage, record.message].find((m): m is string => typeof m === "string") ?? "";
      const constraint =
        [record.constraint, record.constraint_name, meta?.constraint].find(
          (c): c is string => typeof c === "string",
        ) ?? constraintFromMessage(text);
      return {
        sqlState: code,
        ...(constraint ? { constraint } : {}),
        message: typeof record.message === "string" ? record.message : String(current),
      };
    }
    for (const key of ["cause", "meta", "driverAdapterError", "originalError", "kind"]) {
      if (asRecord(record[key])) queue.push(record[key]);
    }
  }
  // Last resort: some paths only preserve the SQLSTATE inside the message text.
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /(?:code|SQLSTATE)\W+([0-9A-Z]{5})\b/.exec(text);
  if (match?.[1]) {
    const constraint = constraintFromMessage(text);
    return { sqlState: match[1], ...(constraint ? { constraint } : {}), message: text };
  }
  return null;
}

export const PG = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  exclusionViolation: "23P01",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
} as const;

export function isRetryable(info: PgErrorInfo | null): boolean {
  return info?.sqlState === PG.serializationFailure || info?.sqlState === PG.deadlockDetected;
}

/** Constraint name → domain error. Modules register their own mappings from their infrastructure. */
type Mapper = (info: PgErrorInfo) => DomainError;
const constraintMappers = new Map<string, Mapper>();

export function registerConstraintError(constraint: string, mapper: Mapper): void {
  constraintMappers.set(constraint, mapper);
}

export class DataIntegrityError extends ConflictError {
  override readonly code = "DATA_INTEGRITY";
  constructor(readonly constraint: string | undefined) {
    super("That change conflicts with existing data.");
  }
}

/** Converts a database error into a domain error when we recognise it; otherwise returns it unchanged. */
export function mapDatabaseError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  const info = extractPgError(error);
  if (!info) return error;
  if (isRetryable(info)) return new ConcurrencyError();
  if (info.constraint) {
    const mapper = constraintMappers.get(info.constraint);
    if (mapper) return mapper(info);
  }
  const integrity: string[] = [
    PG.uniqueViolation,
    PG.checkViolation,
    PG.exclusionViolation,
    PG.foreignKeyViolation,
  ];
  if (integrity.includes(info.sqlState)) return new DataIntegrityError(info.constraint);
  return error;
}
