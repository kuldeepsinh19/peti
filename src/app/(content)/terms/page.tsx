import type { Metadata } from "next";
import { marketplacePolicy as policy } from "@/config/marketplace-policy";
import { Notice } from "@/shared/ui/feedback";
import { Article } from "../../_components/article";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Article
      eyebrow="Terms of use"
      title="Terms"
      updated="12 November 2026"
      lede="These are the working terms of an open-source early release. They describe how the product behaves; they have not been reviewed by a lawyer and must be before Peti handles real money."
      aside={
        <Notice tone="warning" title="Draft">
          Not legal advice. Not yet reviewed by counsel.
        </Notice>
      }
      sections={[
        {
          id: "service",
          title: "The service",
          body: (
            <p>
              Peti is a platform that lets individuals (&ldquo;owners&rdquo;) rent garments they own to other
              individuals (&ldquo;renters&rdquo;). Peti does not own, inspect, store, clean or deliver
              garments and is not a party to the garment itself; it provides the listing, booking, payment,
              record-keeping and dispute process described here.
            </p>
          ),
        },
        {
          id: "accounts",
          title: "Accounts",
          body: (
            <ul>
              <li>You must be at least 18 and give accurate contact details.</li>
              <li>You must confirm your email address, and your mobile number before renting or lending.</li>
              <li>One person, one account. Administrators may suspend accounts that break these terms.</li>
            </ul>
          ),
        },
        {
          id: "owners",
          title: "Owners",
          body: (
            <ul>
              <li>You may only list garments you own and have the right to rent out.</li>
              <li>
                Descriptions, photographs, measurements and condition must be accurate, including known flaws.
              </li>
              <li>You must hand over the garment clean and in the condition described.</li>
              <li>
                You authorise Peti to deduct a commission of {policy.commissionBps / 100}% of the rental fee
                from each payout.
              </li>
            </ul>
          ),
        },
        {
          id: "renters",
          title: "Renters",
          body: (
            <ul>
              <li>You are responsible for the garment from handover until it is returned.</li>
              <li>Do not alter, re-rent or lend the garment to anyone else.</li>
              <li>Return it on time and in the condition you received it, allowing for normal wear.</li>
            </ul>
          ),
        },
        {
          id: "agreement",
          title: "Each rental agreement",
          body: (
            <p>
              When a renter requests a booking and the owner accepts it, both accept the price, deposit, dates
              and the policies in force at that moment (policy version {policy.version}). Those terms are
              stored with the booking and do not change if Peti&rsquo;s policies change later. Cancellation,
              late-return, inspection and dispute rules are described on the{" "}
              <a href="/how-it-works">How it works</a> and <a href="/trust-and-safety">Trust &amp; safety</a>{" "}
              pages and form part of these terms.
            </p>
          ),
        },
        {
          id: "payments",
          title: "Payments",
          body: (
            <p>
              Payments are processed by a third-party payment provider. A booking is confirmed only after the
              provider confirms payment. Refunds are initiated by Peti and their arrival depends on the
              provider and your bank. In this release owner payouts are made by an administrator after the
              rental completes.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Liability",
          body: (
            <p>
              The security deposit is the most that can be recovered through Peti for loss of or damage to a
              garment. Peti is not liable for disputes between owners and renters beyond operating the process
              described in these terms.
            </p>
          ),
        },
      ]}
    />
  );
}
