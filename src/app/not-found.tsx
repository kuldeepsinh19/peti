import Link from "next/link";
import { ButtonLink } from "@/shared/ui/button";
import { Page, PageHeader } from "@/shared/ui/layout";

export const metadata = { title: "Page not found" };

/** Shown for any address that does not exist, and wherever a page calls notFound(). */
export default function NotFound() {
  return (
    <Page className="max-w-3xl py-16">
      <PageHeader
        eyebrow="404"
        title={
          <>
            Not <span className="display-italic">here.</span>
          </>
        }
        lede="This page does not exist, or it is not available to you. A listing may have been paused or removed by its owner."
      />
      <div className="mt-10 flex flex-wrap items-center gap-6">
        <ButtonLink href="/explore">Explore outfits</ButtonLink>
        <Link href="/">Back to the home page</Link>
      </div>
    </Page>
  );
}
