"use server";

import { notFound, redirect } from "next/navigation";
import { container } from "@/composition/container";
import { isDevToolingEnabled } from "@/config/env";

/** The numbers in a sweep report, as `section.name` → count. */
function counts(value: unknown, prefix = ""): Array<[string, number]> {
  if (typeof value === "number") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([k, v]) => counts(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * Runs the background sweep once, now (local POC only): the same work the scheduler does every few minutes in
 * a deployment — expiring unanswered requests and unpaid bookings, completing rentals whose inspection window
 * closed, sending queued refunds (to the sandbox provider) and emails (to the dev outbox).
 */
export async function runBackgroundJobsAction(): Promise<void> {
  if (!isDevToolingEnabled()) notFound();
  const report = await container().sweep();
  const params = new URLSearchParams({ ran: "1" });
  for (const [name, n] of counts(report)) params.set(name, String(n));
  redirect(`/dev?${params.toString()}`);
}
