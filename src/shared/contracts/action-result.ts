import { DomainError, ValidationError } from "../domain/errors";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } };
}

export const INTERNAL_ERROR: ActionError = {
  code: "INTERNAL_ERROR",
  message: "Something went wrong on our side. Please try again.",
};

/** Expected errors become a typed failure; anything else is reported as INTERNAL_ERROR without details. */
export function toActionError(error: unknown): ActionError | null {
  if (error instanceof ValidationError) {
    return { code: error.code, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  return null;
}
