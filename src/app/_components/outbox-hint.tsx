import Link from "next/link";
import { getEnv, isDevToolingEnabled } from "@/config/env";
import { Notice } from "@/shared/ui/feedback";

/**
 * Local POC only: emails and one-time codes go to the dev outbox instead of a real inbox or phone, so say
 * where to find them. Renders nothing on a deployment or when real senders are configured.
 */
export function OutboxHint({ what = "Emails and one-time codes" }: { what?: string }) {
  const env = getEnv();
  if (!isDevToolingEnabled(env) || (env.MAIL_DRIVER !== "outbox" && env.SMS_DRIVER !== "outbox")) return null;
  return (
    <Notice tone="neutral" title="Local POC: nothing is really sent">
      {what} are simulated here: read them in the <Link href="/dev/outbox">Outbox</Link>.
    </Notice>
  );
}
