"use server";

import { container } from "@/composition/container";

type SandboxOutcome = Parameters<NonNullable<ReturnType<typeof container>["sandbox"]>["simulate"]>[1];

const OUTCOMES: readonly SandboxOutcome[] = [
  "pay",
  "pay-webhook-only",
  "pay-callback-only",
  "pay-duplicate-webhook",
  "fail",
];

/**
 * Plays the payment provider: records the outcome on the sandbox side, then delivers the signed webhook(s)
 * over HTTP to the app's own webhook route — exactly as a real provider would. The signed browser
 * callback is returned to the page, which posts it to the callback route.
 */
export async function completeSandboxCheckout(
  orderId: string,
  outcome: string,
): Promise<{ callback: Record<string, string> | null; callbackUrl: string; webhookStatuses: number[] }> {
  const { sandbox, env, devTooling } = container();
  if (!devTooling || !sandbox) throw new Error("The sandbox provider is not enabled.");
  if (!OUTCOMES.includes(outcome as SandboxOutcome)) throw new Error("Unknown outcome.");
  const sim = await sandbox.simulate(orderId, outcome as SandboxOutcome);
  const webhookStatuses: number[] = [];
  for (const w of sim.webhooks) {
    const res = await fetch(new URL("/api/payments/webhook/sandbox", env.APP_URL), {
      method: "POST",
      headers: w.headers,
      body: w.body,
    });
    webhookStatuses.push(res.status);
  }
  return {
    callback: sim.callback,
    callbackUrl: `${env.APP_URL}/api/payments/callback/sandbox`,
    webhookStatuses,
  };
}
