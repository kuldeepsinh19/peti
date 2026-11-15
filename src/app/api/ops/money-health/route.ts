import { container } from "@/composition/container";
import { bearerMatches } from "../../../_lib/bearer";

export const dynamic = "force-dynamic";

/**
 * Money pipeline health for an external monitor (ADR-006). Authenticated with the scheduler secret; answers
 * 200 when nothing needs attention and 503 when something does, so an uptime monitor can alert on status
 * alone. The body holds counts only: no names, booking references or amounts.
 */
export async function GET(request: Request) {
  const { env, money } = container();
  if (!bearerMatches(request.headers.get("authorization"), env.CRON_SECRET))
    return new Response("Unauthorized", { status: 401 });
  const health = await money.monitor();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}
