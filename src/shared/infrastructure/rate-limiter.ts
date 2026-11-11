import "server-only";
import type { RateLimiter, RateLimitRule } from "../application/rate-limiter";
import type { Clock } from "../domain/clock";
import { RateLimitedError } from "../domain/errors";
import type { Db } from "./prisma";

/** Fixed-window counter in Postgres: one atomic upsert per attempt, safe across processes. */
export function postgresRateLimiter(db: Db, clock: Clock): RateLimiter {
  return {
    async consume(rule: RateLimitRule, subject: string) {
      const windowMs = rule.windowSeconds * 1000;
      const now = clock.now().getTime();
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const key = `${rule.name}:${subject}`;
      const rows = await db.$queryRaw<{ count: number }[]>`
        INSERT INTO app_rate_limits (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN app_rate_limits.window_start = EXCLUDED.window_start
                       THEN app_rate_limits.count + 1 ELSE 1 END,
          window_start = EXCLUDED.window_start
        RETURNING count`;
      const count = rows[0]?.count ?? 1;
      if (count > rule.limit) {
        throw new RateLimitedError(Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
      }
    },
  };
}
