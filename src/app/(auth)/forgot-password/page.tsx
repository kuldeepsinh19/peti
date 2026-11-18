import type { Metadata } from "next";
import { OutboxHint } from "@/app/_components/outbox-hint";
import Link from "next/link";
import { allowsSelfServiceAccounts } from "@/config/env";
import { ForgotPasswordForm } from "@/modules/auth/ui/auth-forms";
import { SectionIndex } from "@/shared/ui/layout";
import { DemoAccountsOnly } from "../demo-notice";

export const metadata: Metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionIndex>Password recovery</SectionIndex>
      <h1 className="text-display-md">Forgotten your password?</h1>
      <p className="text-graphite">
        Enter the email you signed up with and we will send you a link to choose a new one.
      </p>
      <OutboxHint what="Password reset emails" />
      {allowsSelfServiceAccounts() ? <ForgotPasswordForm /> : <DemoAccountsOnly />}
      <p className="text-sm text-graphite">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
