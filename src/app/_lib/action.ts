import "server-only";
import { randomUUID } from "node:crypto";
import { container } from "@/composition/container";
import { getActor } from "@/composition/session";
import { type ActionResult, INTERNAL_ERROR, toActionError } from "@/shared/contracts/action-result";
import type { UserActor } from "@/shared/application/actor";
import type { RateLimitRule } from "@/shared/application/rate-limiter";
import { UnauthenticatedError } from "@/shared/domain/errors";
import { logger } from "@/shared/infrastructure/logger";

/**
 * Wraps a Server Action body: resolves the signed-in actor, runs one use case, and converts errors into a
 * typed ActionResult. Expected (domain) errors keep their code and message; anything else is logged with a
 * reference and returned as INTERNAL_ERROR, never leaking internals to the browser.
 *
 * `limit`, when given, is consumed per user before the body runs (so a rejected call does no work).
 */
export async function runAction<T>(
  name: string,
  body: (actor: UserActor) => Promise<T>,
  limit?: RateLimitRule,
): Promise<ActionResult<T>> {
  try {
    const actor = await getActor();
    if (!actor) throw new UnauthenticatedError();
    if (limit) await container().rateLimiter.consume(limit, actor.userId);
    return { ok: true, data: await body(actor) };
  } catch (error) {
    const expected = toActionError(error);
    if (expected) return { ok: false, error: expected };
    const reference = randomUUID().slice(0, 8);
    logger.error(`action ${name} failed`, error, { reference });
    return {
      ok: false,
      error: { ...INTERNAL_ERROR, message: `${INTERNAL_ERROR.message} (ref ${reference})` },
    };
  }
}
