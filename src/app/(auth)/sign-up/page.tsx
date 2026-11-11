import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/modules/auth/ui/auth-forms";
import { SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Join Peti" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionIndex>Join Peti</SectionIndex>
      <h1 className="text-display-md">
        One account to <span className="display-italic">rent</span> and to lend.
      </h1>
      <p className="text-graphite">
        We will email you a link to confirm your address. To request or list an outfit you will also verify
        your mobile number. We never ask for identity documents.
      </p>
      <SignUpForm />
      <p className="text-sm text-graphite">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
