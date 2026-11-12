import { NextResponse } from "next/server";
import { container } from "@/composition/container";
import { logger } from "@/shared/infrastructure/logger";

export const dynamic = "force-dynamic";

/**
 * Browser callback from the payment provider's checkout. Cross-site, so no session cookie is assumed:
 * the request is authenticated only by its signature (verified in the payments module), and the result is
 * shown by redirecting to the booking page, which reads the database — never by trusting query parameters.
 */
async function handle(request: Request, provider: string, params: Record<string, string>) {
  const { payments, env } = container();
  if (provider !== payments.providerId) return new Response("Not found", { status: 404 });
  try {
    const result = await payments.handleCallback(params);
    const target = result.bookingId
      ? `/account/rentals/${result.bookingId}?payment=${result.outcome.toLowerCase()}`
      : "/account/rentals?payment=invalid";
    return NextResponse.redirect(new URL(target, env.APP_URL), 303);
  } catch (error) {
    logger.error("payment callback failed", error, { provider });
    return NextResponse.redirect(new URL("/account/rentals?payment=error", env.APP_URL), 303);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  return handle(request, (await params).provider, fields);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const fields = Object.fromEntries(new URL(request.url).searchParams.entries());
  return handle(request, (await params).provider, fields);
}
