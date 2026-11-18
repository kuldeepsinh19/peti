"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Page, PageHeader } from "@/shared/ui/layout";

/**
 * An unexpected error while rendering a page. Shows no internal detail: only the reference Next.js attaches
 * (the digest), which matches the server log entry.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Page className="max-w-3xl py-16">
      <PageHeader
        eyebrow="Something went wrong"
        title={
          <>
            That did not <span className="display-italic">work.</span>
          </>
        }
        lede="Peti could not show this page. Nothing you entered has been lost if it was saved before this. Try again in a moment."
      />
      <div className="mt-10 flex flex-wrap items-center gap-6">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/">Back to the home page</Link>
      </div>
      {error.digest ? (
        <p className="mt-8 text-caption text-stone">
          Reference <code className="numeral">{error.digest}</code> — quote it if you contact Peti.
        </p>
      ) : null}
    </Page>
  );
}
