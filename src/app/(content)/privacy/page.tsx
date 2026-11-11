import type { Metadata } from "next";
import { Notice } from "@/shared/ui/feedback";
import { Article } from "../../_components/article";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Article
      eyebrow="Privacy notice"
      title="Privacy"
      updated="12 November 2026"
      lede="Peti collects the minimum it needs to run rentals between people who have never met. This notice lists exactly what that is."
      aside={
        <Notice tone="warning" title="Draft">
          Not legal advice. To be reviewed against the Digital Personal Data Protection Act, 2023 before
          launch.
        </Notice>
      }
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <ul>
              <li>
                <strong>Account:</strong> name, email address, mobile number, a hashed password, and whether
                your email and phone have been confirmed.
              </li>
              <li>
                <strong>Addresses</strong> you add for pickups and returns.
              </li>
              <li>
                <strong>Listings and rentals:</strong> garment details and photographs, booking dates,
                condition reports, reviews and dispute messages.
              </li>
              <li>
                <strong>Payments:</strong> amounts and the payment provider&rsquo;s reference numbers. Card
                and UPI details are handled by the provider; Peti never sees or stores them.
              </li>
              <li>
                <strong>Security:</strong> session records and rate-limit counters, used to protect accounts.
              </li>
            </ul>
          ),
        },
        {
          id: "not-collect",
          title: "What we do not collect",
          body: (
            <ul>
              <li>Aadhaar numbers, PAN numbers or images of identity documents.</li>
              <li>Location data from photographs — it is removed when you upload.</li>
              <li>Advertising or third-party tracking cookies.</li>
            </ul>
          ),
        },
        {
          id: "sharing",
          title: "Who sees what",
          body: (
            <ul>
              <li>
                Anyone can see a listing, its locality and the owner&rsquo;s display name and public reviews.
              </li>
              <li>
                Your phone number and pickup address are shared with the other person only after a booking is
                confirmed and paid.
              </li>
              <li>
                Condition-report photographs are visible only to the two people in the rental and
                administrators.
              </li>
              <li>The payment provider receives what it needs to process the payment.</li>
            </ul>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <p>
              Booking, payment and audit records are kept for as long as needed for accounting and dispute
              purposes. Payment-provider webhook payloads are stored for reconciliation and stripped of
              contact details. You can ask for your account to be closed; records tied to completed rentals
              are retained where the law requires.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your choices",
          body: (
            <p>
              You can edit your profile and addresses at any time, and ask us for a copy of your data or for
              your account to be deleted by contacting the administrators listed in the project repository.
            </p>
          ),
        },
      ]}
    />
  );
}
