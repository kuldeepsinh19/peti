import type { Metadata } from "next";
import { marketplacePolicy as policy } from "@/config/marketplace-policy";
import { Article } from "../../_components/article";

export const metadata: Metadata = {
  title: "Trust & safety",
  description: "What Peti verifies, how deposits and damage are handled, and how disputes are resolved.",
};

export default function TrustAndSafetyPage() {
  return (
    <Article
      eyebrow="Trust & safety"
      title={
        <>
          Expensive garments, <span className="display-italic">handled honestly.</span>
        </>
      }
      lede="Lending something you paid ₹20,000 for to a stranger takes trust. This page sets out exactly what Peti checks, what it does not, and what happens when something goes wrong."
      sections={[
        {
          id: "verification",
          title: "What we verify",
          body: (
            <>
              <ul>
                <li>
                  <strong>Email address</strong> — confirmed by a one-time link before you can rent or lend.
                </li>
                <li>
                  <strong>Mobile number</strong> — confirmed by a one-time code. Required before you request a
                  rental or publish a listing, because it is how the other person reaches you.
                </li>
                <li>
                  <strong>Payment</strong> — a booking is confirmed only after the payment provider confirms
                  the money was received. We never mark a payment as successful on our own.
                </li>
              </ul>
              <h3>What we do not verify</h3>
              <p>
                <strong>We do not verify identity documents.</strong> We do not ask for, or store, Aadhaar
                numbers, PAN cards or photographs of ID. Profiles show exactly which of the checks above a
                person has passed, and never say &ldquo;ID verified&rdquo;. If we introduce identity
                verification in future, it will be through a regulated provider, and only the result will be
                stored.
              </p>
            </>
          ),
        },
        {
          id: "condition",
          title: "Condition reports",
          body: (
            <>
              <p>
                Every listing records the garment&rsquo;s condition and its known flaws. Each rental then adds
                two timestamped reports, each with at least {policy.minConditionPhotos} photographs:
              </p>
              <ul>
                <li>
                  <strong>At handover</strong>, the owner photographs the outfit and notes its condition. The
                  renter checks it in person and acknowledges the report. If it does not match the listing, do
                  not acknowledge — open a dispute instead.
                </li>
                <li>
                  <strong>At return</strong>, the owner photographs it again. The two reports, side by side,
                  are the record any dispute is decided on.
                </li>
              </ul>
              <p>Photographs are stripped of location data when uploaded.</p>
            </>
          ),
        },
        {
          id: "deposits",
          title: "Deposits and damage",
          body: (
            <>
              <p>
                The owner sets a refundable security deposit (at least ₹{policy.depositMinPaise / 100}, and no
                more than the garment&rsquo;s declared retail value). Peti holds it from payment until the
                rental is settled.
              </p>
              <ul>
                <li>
                  <strong>Normal wear and routine dry-cleaning</strong> are the owner&rsquo;s cost and cannot
                  be charged to the deposit.
                </li>
                <li>
                  <strong>Claimable damage</strong> includes tears, stains that need specialist treatment,
                  missing pieces (dupattas, buttons, stoles) and unauthorised alterations.
                </li>
                <li>
                  The owner has {policy.inspectionWindowHours} hours after recording the return to raise a
                  claim, with photographs. A claim cannot exceed the deposit (less any late fee).
                </li>
                <li>
                  The deposit is the most that can be recovered through Peti. Anything beyond it is a matter
                  between the two people involved.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "disputes",
          title: "Disputes",
          body: (
            <>
              <p>A dispute can be opened when:</p>
              <ul>
                <li>the outfit at handover does not match its listing, or the handover did not happen;</li>
                <li>the outfit has not been returned after the rental ended;</li>
                <li>the owner finds damage or missing items after the return;</li>
                <li>the renter disagrees with a late fee.</li>
              </ul>
              <p>
                While a dispute is open, the deposit stays held and no payout is made. The other person can
                accept the claim, which settles it straight away. Otherwise an administrator reviews both
                condition reports and the messages on the dispute, and records a decision — how much of the
                deposit is withheld and how much of the rental fee is refunded — with written reasons. Every
                administrative decision is logged.
              </p>
              <p>
                A rental more than {policy.autoDisputeOverdueDays} days overdue opens a dispute automatically.
              </p>
            </>
          ),
        },
        {
          id: "privacy",
          title: "Your contact details",
          body: (
            <p>
              Listings show a locality (for example &ldquo;Satellite&rdquo; or &ldquo;Bodakdev&rdquo;), never
              a street address. Your phone number and pickup address are shown to the other person only once a
              booking is confirmed and paid.
            </p>
          ),
        },
        {
          id: "safety",
          title: "Meeting in person",
          body: (
            <ul>
              <li>Meet somewhere you are comfortable, in daylight if you can.</li>
              <li>
                Never pay or accept payment outside Peti — off-platform payments are not covered by the
                deposit.
              </li>
              <li>
                Report anything that worries you from the booking page; administrators can suspend accounts.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
