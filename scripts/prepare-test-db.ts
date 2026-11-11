/**
 * Applies every pending migration to the integration-test database (DATABASE_URL_TEST).
 *   pnpm db:test:prepare
 *
 * This is deliberately `migrate deploy` (non-destructive), not `migrate reset`: tests clean up after
 * themselves by truncating tables, so the database never needs to be dropped.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error("DATABASE_URL_TEST is not set (see .env.example).");
  process.exit(1);
}

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: url },
});
