import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/modules/auth/ui/auth-forms";
import { Notice } from "@/shared/ui/feedback";
import { SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <div className="flex flex-col gap-8">
      <SectionIndex>Sign in</SectionIndex>
      <h1 className="text-display-md">
        Welcome <span className="display-italic">back.</span>
      </h1>
      {params.reset === "1" ? (
        <Notice tone="success" title="Password changed">
          Sign in with your new password.
        </Notice>
      ) : null}
      <SignInForm next={next} />
      <p className="text-sm text-graphite">
        New to Peti? <Link href="/sign-up">Create an account</Link>
      </p>
    </div>
  );
}
