/**
 * Base class for expected business failures. `code` is stable and part of the public contract
 * (docs/api/error-handling.md); `message` is safe to show to the user.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  /** Suggested HTTP status when surfaced through a route handler. */
  readonly httpStatus: number = 422;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    if (details) this.details = details;
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_FAILED";
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  override readonly httpStatus = 404;
  constructor(entity: string) {
    super(`${entity} was not found.`);
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";
  override readonly httpStatus = 401;
  constructor() {
    super("Please sign in to continue.");
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  override readonly httpStatus = 403;
  constructor(message = "You are not allowed to do that.") {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code: string = "CONFLICT";
  override readonly httpStatus = 409;
}

export class ConcurrencyError extends ConflictError {
  override readonly code = "CONCURRENT_UPDATE";
  constructor() {
    super("Someone else changed this at the same moment. Please try again.");
  }
}

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED";
  override readonly httpStatus = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Please wait a moment and try again.");
  }
}

export class PreconditionError extends DomainError {
  readonly code: string;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}
