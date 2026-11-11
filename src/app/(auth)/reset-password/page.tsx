import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/modules/auth/ui/auth-forms";
import { Notice } from "@/shared/ui/feedback";
import { SectionIndex } from "@/shared/ui/layout";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  return (
    <div className="flex flex-col gap-8">
      <SectionIndex>Password recovery</SectionIndex>
      <h1 className="text-display-md">Choose a new password</h1>
      {token && !params.error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Notice tone="danger" title="This link is not valid">
          It may have expired or already been used. <Link href="/forgot-password">Request a new link</Link>.
        </Notice>
      )}
    </div>
  );
}
