import Link from "next/link";
import { demoAccounts, localSeedAccounts } from "@/config/site";
import { Notice } from "@/shared/ui/feedback";

/** The public demo's shared accounts, shown on the sign-in page. */
export function DemoAccounts() {
  return (
    <Notice tone="neutral" title="This is a demonstration with fictional data">
      Sign in with a shared demo account, password <code className="numeral">{demoAccounts.password}</code>:{" "}
      {demoAccounts.accounts.map((a, i) => (
        <span key={a.email}>
          {i > 0 ? ", " : ""}
          <code>{a.email}</code> ({a.role.toLowerCase()})
        </span>
      ))}
      . Payments go through a sandbox; no real money moves.
    </Notice>
  );
}

/** The local POC's seeded accounts (development tooling only). */
export function LocalAccounts() {
  return (
    <Notice tone="neutral" title="Local POC: seeded accounts">
      <p>
        Password <code className="numeral">{localSeedAccounts.password}</code> for each. Shown only on this
        computer, never on a deployment.
      </p>
      <ul className="mt-2 flex flex-col gap-1" data-testid="local-accounts">
        {localSeedAccounts.accounts.map((a) => (
          <li key={a.email}>
            <code>{a.email}</code> — {a.role}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/** Replaces sign-up and password recovery in the public demo, where accounts are shared and fictional. */
export function DemoAccountsOnly() {
  return (
    <Notice tone="neutral" title="Not available in the demonstration">
      New accounts and password changes are switched off here, so the shared demo accounts stay usable for
      everyone and no real personal details are collected.{" "}
      <Link href="/sign-in">Sign in with a demo account</Link>.
    </Notice>
  );
}
