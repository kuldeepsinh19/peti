import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/ui/auth-forms";
import { SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionIndex>Password recovery</SectionIndex>
      <h1 className="text-display-md">Forgotten your password?</h1>
      <p className="text-graphite">
        Enter the email you signed up with and we will send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="text-sm text-graphite">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
