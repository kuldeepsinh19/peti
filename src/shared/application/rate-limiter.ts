export interface RateLimitRule {
  /** Logical bucket, e.g. "booking-request". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Throws RateLimitedError when the caller has exceeded the rule. */
export interface RateLimiter {
  consume(rule: RateLimitRule, subject: string): Promise<void>;
}
