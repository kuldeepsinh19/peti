import { container } from "@/composition/container";
import { logger } from "@/shared/infrastructure/logger";

export const dynamic = "force-dynamic";

/**
 * Liveness by default: the process answers. With `?ready=1`, readiness: the configuration is valid, the
 * database answers and no migration is half-applied. Why it failed goes to the log, never to the response.
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("ready") !== "1") return Response.json({ status: "ok" });
  try {
    const rows = await container().db.$queryRaw<Array<{ applied: number; unfinished: number }>>`
      SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
             count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished
      FROM _prisma_migrations`;
    const { applied, unfinished } = rows[0]!;
    if (unfinished > 0) {
      logger.error("readiness: a migration has not finished", undefined, { unfinished });
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
    return Response.json({ status: "ok", database: "ok", migrations: applied });
  } catch (error) {
    logger.error("readiness check failed", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
