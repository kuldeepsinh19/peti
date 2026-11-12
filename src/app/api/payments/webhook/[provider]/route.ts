import { container } from "@/composition/container";
import { logger } from "@/shared/infrastructure/logger";

export const dynamic = "force-dynamic";

/** Provider webhooks. The signature is checked over the exact raw body, before anything is stored. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { payments } = container();
  if ((await params).provider !== payments.providerId) return new Response("Not found", { status: 404 });
  const rawBody = await request.text();
  const headers = Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  try {
    const result = await payments.handleWebhook(rawBody, headers);
    if (result.status >= 400)
      logger.warn("webhook rejected or failed", { status: result.status, reason: result.body });
    return new Response(result.body, { status: result.status });
  } catch (error) {
    logger.error("webhook handling failed", error);
    return new Response("failed", { status: 500 });
  }
}
