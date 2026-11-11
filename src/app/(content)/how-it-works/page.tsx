import type { Metadata } from "next";
import Link from "next/link";
import { marketplacePolicy as policy } from "@/config/marketplace-policy";
import { Article } from "../../_components/article";

export const metadata: Metadata = {
  title: "How it works",
  description: "How renting and lending occasionwear works on Peti, from request to return.",
};

const pct = (bps: number) => `${bps / 100}%`;

export default function HowItWorksPage() {
  return (
    <Article
      eyebrow="How it works"
      title={
        <>
          From request <span className="display-italic">to return.</span>
        </>
      }
      lede="Peti connects people in Ahmedabad who own occasionwear with people who need it for a few days. Owners decide the price and who rents; the platform holds the money and keeps the record."
      sections={[
        {
          id: "renting",
          title: "Renting an outfit",
          body: (
            <>
              <ol>
                <li>
                  <strong>Find it.</strong> Search by keyword, category, occasion, price, locality and size —
                  sizes are the garment&rsquo;s measured chest, waist, hip and length, not only S, M or L.
                </li>
                <li>
                  <strong>Pick your dates.</strong> Choose a start date and one of the durations the owner
                  offers ({policy.durationOptionsDays.join(", ")} days). The earliest start is{" "}
                  {policy.minLeadDays} days from today, so there is time to approve and pay.
                </li>
                <li>
                  <strong>Request it.</strong> You see the full price before you ask: rental fee plus a
                  refundable security deposit. Nothing is charged at this point.
                </li>
                <li>
                  <strong>Wait for the owner.</strong> They have up to {policy.approvalWindowHours} hours to
                  accept or decline. If they accept, the dates are held for you.
                </li>
                <li>
                  <strong>Pay within {policy.paymentWindowHours} hours.</strong> Your booking is confirmed
                  only when the payment provider confirms the payment. If you do not pay in time, the dates
                  are released.
                </li>
                <li>
                  <strong>Meet and collect.</strong> Once confirmed, you see the owner&rsquo;s phone number
                  and pickup address. The owner photographs the outfit at handover; you check it and
                  acknowledge.
                </li>
                <li>
                  <strong>Return it.</strong> The owner records the return with photographs. They have{" "}
                  {policy.inspectionWindowHours} hours to confirm it came back as it left; if they say
                  nothing, your deposit is released automatically.
                </li>
              </ol>
            </>
          ),
        },
        {
          id: "lending",
          title: "Lending an outfit",
          body: (
            <>
              <ol>
                <li>
                  <strong>Verify your phone number</strong> so renters can reach you after a booking is
                  confirmed.
                </li>
                <li>
                  <strong>Create the listing.</strong> Photographs (up to {policy.maxListingPhotos}), an
                  honest description, the category and occasions it suits, its retail value, real
                  measurements, its condition, your locality and a price for each duration you offer.
                </li>
                <li>
                  <strong>Set the deposit and cleaning days.</strong> The deposit is refundable and must be at
                  least ₹{policy.depositMinPaise / 100}. After every rental your calendar blocks{" "}
                  {policy.turnaroundDaysDefault} day for cleaning by default; you can choose 0 to{" "}
                  {policy.turnaroundDaysMax}.
                </li>
                <li>
                  <strong>Submit for review.</strong> An administrator checks every listing before it is
                  published.
                </li>
                <li>
                  <strong>Approve requests.</strong> You decide who rents. Two confirmed rentals can never
                  overlap — the database itself refuses it.
                </li>
                <li>
                  <strong>Get paid.</strong> After the rental completes, your payout is recorded: the rental
                  fee minus Peti&rsquo;s {pct(policy.commissionBps)} commission, plus any part of the deposit
                  kept for a late return or damage.
                </li>
              </ol>
            </>
          ),
        },
        {
          id: "money",
          title: "Where the money goes",
          body: (
            <>
              <p>
                The renter pays the rental fee and the deposit together. Peti holds both until the rental is
                settled:
              </p>
              <ul>
                <li>
                  <strong>Rental fee:</strong> goes to the owner, minus a {pct(policy.commissionBps)}{" "}
                  commission. Peti earns nothing on rentals that do not go ahead.
                </li>
                <li>
                  <strong>Deposit:</strong> refunded to the renter after return, minus any late fee or agreed
                  damage charge — which goes to the owner in full. Peti never keeps deposit money.
                </li>
                <li>
                  <strong>Late returns:</strong> each late day costs one and a half times the daily rate,
                  taken from the deposit and capped at it.
                </li>
              </ul>
              <p>
                In this early release, owner payouts are recorded by Peti and paid out by an administrator
                (for example by UPI), with the payment reference recorded against the rental.
              </p>
            </>
          ),
        },
        {
          id: "cancelling",
          title: "Cancelling",
          body: (
            <>
              <ul>
                <li>Before you pay, either side can cancel at no cost.</li>
                <li>
                  After you pay, your deposit always comes back in full. The rental fee is refunded in full if
                  you cancel 7 or more days before the start, half if you cancel between 48 hours and 7 days
                  before, and not at all within 48 hours.
                </li>
                <li>
                  If the owner cancels after you have paid, you get everything back, and the cancellation is
                  recorded on the owner&rsquo;s account.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "problems",
          title: "If something goes wrong",
          body: (
            <p>
              Either side can open a dispute: an outfit not as described at handover, an outfit not returned,
              damage found at return, or a late fee you disagree with. While a dispute is open, the deposit
              stays held. An administrator decides using the handover and return condition reports. Read the{" "}
              <Link href="/trust-and-safety">trust and safety policy</Link> for the details.
            </p>
          ),
        },
      ]}
    />
  );
}
