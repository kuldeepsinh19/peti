/**
 * Triggers one background sweep on a running Peti server (deadlines, refunds, notification emails).
 *   pnpm jobs:sweep
 * In production, a scheduler calls POST /api/cron/sweep every few minutes with the same bearer secret.
 */
import "dotenv/config";

const url = new URL("/api/cron/sweep", process.env.APP_URL ?? "http://localhost:3000");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set.");
  process.exit(1);
}
const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
console.log(response.status, await response.text());
if (!response.ok) process.exitCode = 1;
