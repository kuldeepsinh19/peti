import { timingSafeEqual } from "node:crypto";
import { container } from "@/composition/container";
import { logger } from "@/shared/infrastructure/logger";

export const dynamic = "force-dynamic";

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Runs deadlines, refund dispatch and email delivery once. Call it from a scheduler every few minutes. */
export async function POST(request: Request) {
  const { env, sweep } = container();
  if (!authorised(request.headers.get("authorization"), env.CRON_SECRET))
    return new Response("Unauthorized", { status: 401 });
  const report = await sweep();
  logger.info("sweep completed", report);
  return Response.json(report);
}
