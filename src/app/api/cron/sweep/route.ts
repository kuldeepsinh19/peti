import { container } from "@/composition/container";
import { logger } from "@/shared/infrastructure/logger";
import { bearerMatches } from "../../../_lib/bearer";

export const dynamic = "force-dynamic";

/**
 * Runs deadlines, payment and refund reconciliation, refund dispatch and email delivery once. Call it from
 * a scheduler every few minutes.
 */
export async function POST(request: Request) {
  return runSweep(request);
}

/** Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`; same check, same work. */
export async function GET(request: Request) {
  return runSweep(request);
}

async function runSweep(request: Request) {
  const { env, sweep } = container();
  if (!bearerMatches(request.headers.get("authorization"), env.CRON_SECRET))
    return new Response("Unauthorized", { status: 401 });
  const report = await sweep();
  logger.info("sweep completed", report);
  return Response.json(report);
}
