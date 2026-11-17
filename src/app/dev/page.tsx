import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDevToolingEnabled } from "@/config/env";
import { Notice } from "@/shared/ui/feedback";
import { Page, PageHeader } from "@/shared/ui/layout";
import { SubmitButton } from "@/shared/ui/submit-button";
import { runBackgroundJobsAction } from "./actions";

export const metadata: Metadata = { title: "Local POC tools", robots: { index: false } };

const LABELS: Record<string, string> = {
  "bookings.expiredApprovals": "Requests expired unanswered",
  "bookings.expiredPayments": "Bookings expired unpaid",
  "bookings.autoCompleted": "Rentals completed after the inspection window",
  "bookings.autoDisputed": "Rentals sent to a dispute (not returned)",
  "bookings.errors": "Booking steps that failed",
  "paymentsReconciled.checked": "Payments checked with the provider",
  "paymentsReconciled.applied": "Payment updates applied",
  "paymentsReconciled.errors": "Payment checks that failed",
  "refunds.claimed": "Refunds picked up",
  "refunds.sent": "Refunds sent to the (sandbox) provider",
  "refundsReconciled.settled": "Refunds confirmed by the provider",
  "refundsReconciled.errors": "Refund checks that failed",
  "emails.sent": "Emails delivered (to the outbox)",
  reviewsPublished: "Reviews published",
};

/** Local POC only (the layout and proxy return 404 elsewhere). */
export default async function DevToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isDevToolingEnabled()) notFound();
  const params = await searchParams;
  const ran = params.ran === "1";
  const results = Object.entries(params).filter(
    (e): e is [string, string] => e[0] !== "ran" && typeof e[1] === "string" && /^\d{1,6}$/.test(e[1]),
  );

  return (
    <Page className="max-w-3xl pb-16">
      <PageHeader
        eyebrow="Local POC"
        title="Tools"
        lede="For demonstrating Peti on this computer. Payments, emails and text messages here are simulated: nothing is charged and nothing leaves this machine."
      />

      <section aria-labelledby="jobs" className="mt-10 flex flex-col gap-4 border-t border-ink pt-6">
        <h2 id="jobs" className="text-display-sm">
          Background jobs
        </h2>
        <p className="text-graphite">
          In a deployment a scheduler runs these every few minutes: it expires unanswered requests and unpaid
          bookings, completes rentals whose inspection window has closed, sends refunds to the payment
          provider (here, the sandbox) and delivers queued emails (here, to the outbox). Run them now instead
          of waiting.
        </p>
        <form action={runBackgroundJobsAction}>
          <SubmitButton>Run background jobs now</SubmitButton>
        </form>
        {ran ? (
          <Notice tone="success" title="Background jobs ran">
            <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="sweep-report">
              {results.map(([name, n]) => (
                <li key={name}>
                  {LABELS[name] ?? name}: <strong>{n}</strong>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </section>

      <section aria-labelledby="more" className="mt-12 flex flex-col gap-3 border-t border-ink pt-6">
        <h2 id="more" className="text-display-sm">
          More
        </h2>
        <ul className="flex flex-col gap-2">
          <li>
            <Link href="/dev/outbox">Outbox</Link> — emails, verification links and one-time codes that would
            have been sent.
          </li>
          <li>
            <Link href="/dev/design-system">Design system</Link> — the components and colours.
          </li>
        </ul>
        <p className="text-sm text-graphite">
          Ready-made bookings for the rental journey: run <code>pnpm db:seed:bookings</code> (see
          docs/development/poc-demo-guide.md).
        </p>
      </section>
    </Page>
  );
}
