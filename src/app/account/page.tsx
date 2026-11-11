import type { Metadata } from "next";
import Link from "next/link";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { SignOutButton } from "@/modules/auth/ui/auth-forms";
import { PhoneVerification, ResendVerificationEmail } from "@/modules/auth/ui/verification";
import { formatIndianMobile } from "@/modules/users";
import { ProfileForm } from "@/modules/users/ui/account-forms";
import { Notice, Tag } from "@/shared/ui/feedback";
import { DefinitionList, PageHeader, SectionIndex } from "@/shared/ui/layout";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Your account" };

const memberSince = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActorOrRedirect("/account");
  const account = await container().users.getAccount(actor);
  const params = await searchParams;
  const ready = account.emailVerified && account.phoneVerified;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={`Member since ${memberSince.format(account.memberSince)}`}
        title={
          <>
            Hello, <span className="display-italic">{account.displayName}</span>.
          </>
        }
        actions={<SignOutButton />}
      />

      <div className="mt-8 flex flex-col gap-4">
        {params.welcome === "1" ? (
          <Notice tone="success" title="Your account is ready">
            We have emailed you a link to confirm your address.
          </Notice>
        ) : null}
        {params.verified === "1" && account.emailVerified ? (
          <Notice tone="success" title="Email confirmed">
            Thank you.
          </Notice>
        ) : null}
        {!ready ? (
          <Notice tone="warning" title="Two quick checks before you rent or lend">
            Confirm your email and verify your mobile number. Browsing and saving outfits work without them.
          </Notice>
        ) : null}
      </div>

      <section aria-labelledby="checks" className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionIndex index={1}>Checks</SectionIndex>
          <h2 id="checks" className="mt-3 text-display-sm">
            What we have verified
          </h2>
          <p className="mt-4 text-sm text-graphite">
            This is exactly what other members see about you. Peti does not verify identity documents.
          </p>
        </div>
        <div className="flex flex-col gap-10 lg:col-span-7 lg:col-start-6">
          <DefinitionList
            items={[
              {
                term: "Email",
                value: (
                  <span className="flex flex-wrap items-center gap-3">
                    {account.email}
                    {account.emailVerified ? (
                      <Tag tone="success">Confirmed</Tag>
                    ) : (
                      <Tag tone="warning">Not confirmed</Tag>
                    )}
                  </span>
                ),
              },
              {
                term: "Mobile",
                value: (
                  <span className="flex flex-wrap items-center gap-3">
                    {account.phoneNumber ? formatIndianMobile(account.phoneNumber) : "Not added"}
                    {account.phoneVerified ? (
                      <Tag tone="success">Verified by code</Tag>
                    ) : (
                      <Tag tone="warning">Not verified</Tag>
                    )}
                  </span>
                ),
              },
              { term: "Identity", value: <Tag>Not verified — Peti does not check ID documents</Tag> },
            ]}
          />
          {!account.emailVerified ? <ResendVerificationEmail email={account.email} /> : null}
          {!account.phoneVerified ? <PhoneVerification currentNumber={account.phoneNumber} /> : null}
        </div>
      </section>

      <section aria-labelledby="profile" className="mt-16 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionIndex index={2}>Profile</SectionIndex>
          <h2 id="profile" className="mt-3 text-display-sm">
            How others see you
          </h2>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <ProfileForm
            defaults={{ displayName: account.displayName, bio: account.bio }}
            action={updateProfileAction}
          />
        </div>
      </section>

      <section aria-labelledby="activity" className="mt-16 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionIndex index={3}>Activity</SectionIndex>
          <h2 id="activity" className="mt-3 text-display-sm">
            At a glance
          </h2>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <DefinitionList
            items={[
              { term: "Outfits listed", value: <Link href="/lend/dashboard">{account.counts.outfits}</Link> },
              {
                term: "Rentals requested",
                value: <Link href="/account/rentals">{account.counts.rentals}</Link>,
              },
              {
                term: "Rentals as lender",
                value: <Link href="/lend/requests">{account.counts.lendings}</Link>,
              },
              {
                term: "Rating as lender",
                value: account.ownerRating.average
                  ? `${account.ownerRating.average} / 5 from ${account.ownerRating.count}`
                  : "No reviews yet",
              },
              {
                term: "Rating as renter",
                value: account.renterRating.average
                  ? `${account.renterRating.average} / 5 from ${account.renterRating.count}`
                  : "No reviews yet",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
