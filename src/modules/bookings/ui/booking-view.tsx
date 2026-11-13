import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { fileUrl } from "@/modules/media";
import type { ActionResult } from "@/shared/contracts/action-result";
import { formatLocalDate } from "@/shared/domain/local-date";
import { formatInr } from "@/shared/domain/money";
import { Button } from "@/shared/ui/button";
import { Notice, Tag } from "@/shared/ui/feedback";
import { conditionLabel } from "@/shared/ui/labels";
import { DefinitionList, SectionIndex } from "@/shared/ui/layout";
import type { BookingDetail } from "../application/queries";
import { readPolicySnapshot } from "../domain/booking-rules";
import { statusLabel } from "../domain/booking-state-machine";
import { ConditionReportForm, PayButton } from "./booking-client";
import { bookingStatusTone } from "./status";

type Role = "RENTER" | "OWNER" | "ADMIN";

export interface BookingViewProps {
  booking: BookingDetail & { viewerRole: Role };
  returnTo: string;
  today: string;
  now: Date;
  command: (formData: FormData) => Promise<void>;
  report: (formData: FormData) => Promise<ActionResult<undefined>>;
  checkout: () => Promise<
    ActionResult<
      | { mode: "REDIRECT"; url: string }
      | { mode: "CLIENT_SDK"; scriptUrl: string; publicConfig: Readonly<Record<string, unknown>> }
    >
  >;
  flash?: { done?: string; error?: string; payment?: string };
}

const instant = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function CommandForm({
  command,
  bookingId,
  returnTo,
  name,
  label,
  variant = "secondary",
  children,
}: {
  command: BookingViewProps["command"];
  bookingId: string;
  returnTo: string;
  name: string;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  children?: ReactNode;
}) {
  return (
    <form action={command} className="flex flex-col gap-4">
      <input type="hidden" name="command" value={name} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <div>
        <Button type="submit" variant={variant}>
          {label}
        </Button>
      </div>
    </form>
  );
}

const field =
  "border-0 border-b border-rule-strong bg-transparent py-2 text-sm focus:border-ink focus:outline-none";

function ReasonInput({ required, label = "Reason" }: { required?: boolean; label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow text-graphite">{label}</span>
      <input name="reason" required={required} maxLength={500} className={field} />
    </label>
  );
}

export function BookingView({
  booking: b,
  returnTo,
  today,
  now,
  command,
  report,
  checkout,
  flash,
}: BookingViewProps) {
  const role = b.viewerRole;
  const policy = readPolicySnapshot(b.policy);
  const handover = b.reports.find((r) => r.kind === "HANDOVER");
  const returned = b.reports.find((r) => r.kind === "RETURN");
  const counterpart = role === "RENTER" ? b.owner : b.renter;
  const cmd = { command, bookingId: b.id, returnTo };
  const disputeOpen = b.dispute?.status === "OPEN";
  const isOpener = disputeOpen && b.dispute!.openedById === (role === "OWNER" ? b.owner.id : b.renter.id);

  return (
    <div className="grid gap-12 pb-16 lg:grid-cols-12">
      <header className="flex flex-col gap-6 border-b border-ink pt-10 pb-8 md:flex-row md:items-end md:justify-between lg:col-span-12">
        <div className="flex gap-6">
          {b.outfit.photoKey ? (
            <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-sand">
              <Image src={fileUrl(b.outfit.photoKey)} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="eyebrow text-graphite numeral">Booking {b.reference}</p>
            <h1 className="text-display-sm">
              <Link href={`/outfits/${b.outfit.slug}`} className="no-underline hover:underline">
                {b.outfit.title}
              </Link>
            </h1>
            <p className="text-graphite">
              {formatLocalDate(b.startDate)} – {formatLocalDate(b.endDate)} · {b.rentalDays} days ·{" "}
              {role === "RENTER" ? `lent by ${b.owner.name}` : `rented by ${b.renter.name}`}
            </p>
          </div>
        </div>
        <Tag tone={bookingStatusTone[b.status]} className="self-start md:self-end">
          {statusLabel[b.status]}
        </Tag>
      </header>

      <div className="flex flex-col gap-4 lg:col-span-12">
        {flash?.error ? (
          <Notice tone="danger" title="That did not work">
            {flash.error}
          </Notice>
        ) : null}
        {flash?.done ? <Notice tone="success" title="Done" /> : null}
        {flash?.payment === "confirmed" || flash?.payment === "already_confirmed" ? (
          <Notice tone="success" title="Payment received">
            Your booking is confirmed.
          </Notice>
        ) : null}
        {flash?.payment === "pending" ? (
          <Notice title="Payment processing">
            We will confirm the booking as soon as the payment provider does.
          </Notice>
        ) : null}
        {flash?.payment === "invalid" || flash?.payment === "error" ? (
          <Notice tone="danger" title="We could not verify that payment">
            If money left your account, it will be confirmed or refunded automatically.
          </Notice>
        ) : null}
      </div>

      <section aria-labelledby="next" className="flex flex-col gap-8 lg:col-span-7">
        <div>
          <SectionIndex index={1}>Now</SectionIndex>
          <h2 id="next" className="mt-3 text-display-sm">
            What happens next
          </h2>
        </div>

        {b.status === "PENDING_APPROVAL" ? (
          role === "OWNER" ? (
            <div className="flex flex-col gap-6">
              <p className="text-graphite">
                {b.renter.name} would like these dates.{b.renterNote ? ` Their note: “${b.renterNote}”` : ""}{" "}
                Answer by {b.expiresAt ? instant.format(b.expiresAt) : "soon"}. Approving holds the dates
                while they pay.
              </p>
              <div className="flex flex-wrap items-start gap-8">
                <CommandForm {...cmd} name="approve" label="Approve request" variant="primary" />
                <CommandForm {...cmd} name="reject" label="Decline" variant="quiet">
                  <ReasonInput label="Reason (optional, shown to the renter)" />
                </CommandForm>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <p className="text-graphite">
                Waiting for {b.owner.name} to answer, by {b.expiresAt ? instant.format(b.expiresAt) : "soon"}.
                Nothing has been charged.
              </p>
              {role === "RENTER" ? (
                <CommandForm {...cmd} name="withdraw" label="Withdraw request" variant="quiet" />
              ) : null}
            </div>
          )
        ) : null}

        {b.status === "AWAITING_PAYMENT" ? (
          <div className="flex flex-col gap-6">
            <p className="text-graphite">
              Approved. The dates are held until {b.expiresAt ? instant.format(b.expiresAt) : "the deadline"};
              the booking is confirmed only when the payment provider confirms the payment.
            </p>
            {role === "RENTER" ? (
              <PayButton label={`Pay ${formatInr(b.money.renterTotalPaise)}`} start={checkout} />
            ) : null}
            {role !== "ADMIN" ? (
              <CommandForm {...cmd} name="cancel" label="Cancel booking" variant="quiet" />
            ) : null}
          </div>
        ) : null}

        {b.status === "CONFIRMED" ? (
          <div className="flex flex-col gap-8">
            {role === "OWNER" ? (
              handover ? (
                <p className="text-graphite">
                  Handover recorded. Waiting for {b.renter.name} to check the outfit and acknowledge it.
                </p>
              ) : today >= dayBefore(b.startDate) ? (
                <div className="flex flex-col gap-4">
                  <p className="text-graphite">
                    When you hand the outfit over, photograph it and record its condition. The renter checks
                    it against this report.
                  </p>
                  <ConditionReportForm
                    bookingId={b.id}
                    kind="HANDOVER"
                    minPhotos={policy.minConditionPhotos}
                    submit={report}
                  />
                </div>
              ) : (
                <p className="text-graphite">
                  Arrange the handover with {b.renter.name}. You can record it from{" "}
                  {formatLocalDate(dayBefore(b.startDate) as typeof b.startDate)}.
                </p>
              )
            ) : null}
            {role === "RENTER" ? (
              handover ? (
                <div className="flex flex-col gap-4">
                  <p className="text-graphite">
                    The owner recorded the outfit&rsquo;s condition below. Check it in person. Acknowledge
                    only if it matches; otherwise report a problem.
                  </p>
                  <CommandForm
                    {...cmd}
                    name="acknowledgeHandover"
                    label="It matches — I have the outfit"
                    variant="primary"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="eyebrow text-graphite">Anything to note (optional)</span>
                      <input name="notes" maxLength={1000} className={field} />
                    </label>
                  </CommandForm>
                </div>
              ) : (
                <p className="text-graphite">
                  Arrange collection with {b.owner.name}. At handover, the owner photographs the outfit and
                  you confirm it here.
                </p>
              )
            ) : null}
            {role !== "ADMIN" ? (
              <details className="border-t border-rule pt-4">
                <summary className="cursor-pointer text-sm text-graphite">Cancel this booking</summary>
                <p className="mt-3 text-sm text-graphite">
                  {role === "RENTER"
                    ? "Your deposit is always refunded. The rental fee is refunded in full 7 or more days before the start, half between 48 hours and 7 days, and not at all within 48 hours."
                    : "The renter is refunded in full and the cancellation is recorded on your account."}
                </p>
                <div className="mt-4">
                  <CommandForm {...cmd} name="cancel" label="Cancel booking" variant="danger">
                    <ReasonInput />
                  </CommandForm>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {b.status === "ACTIVE" ? (
          role === "OWNER" ? (
            <div className="flex flex-col gap-4">
              <p className="text-graphite">
                The outfit is due back on {formatLocalDate(b.endDate)}. When it is returned, photograph it and
                record its condition.
              </p>
              <ConditionReportForm
                bookingId={b.id}
                kind="RETURN"
                minPhotos={policy.minConditionPhotos}
                submit={report}
                showReturnDate
              />
            </div>
          ) : (
            <p className="text-graphite">
              Enjoy the occasion. Please return the outfit to {b.owner.name} by {formatLocalDate(b.endDate)};
              each late day costs {formatInr(b.money.lateFeePerDayPaise)} from your deposit.
            </p>
          )
        ) : null}

        {b.status === "RETURNED" ? (
          role === "OWNER" ? (
            <div className="flex flex-col gap-6">
              <p className="text-graphite">
                Check the outfit. If it came back as it left, confirm — otherwise raise a damage claim before{" "}
                {b.inspectionDeadline ? instant.format(b.inspectionDeadline) : "the window closes"}. If you do
                nothing, the deposit is released automatically.
              </p>
              <CommandForm {...cmd} name="confirmReturn" label="Confirm it is fine" variant="primary" />
            </div>
          ) : (
            <p className="text-graphite">
              Returned
              {b.money.lateDays ? `, ${b.money.lateDays} day${b.money.lateDays === 1 ? "" : "s"} late` : ""}.
              The owner has until{" "}
              {b.inspectionDeadline ? instant.format(b.inspectionDeadline) : "the deadline"} to raise a claim;
              after that your deposit is refunded automatically.
            </p>
          )
        ) : null}

        {b.status === "DISPUTED" ? (
          <p className="text-graphite">
            A dispute is open. The deposit stays held until it is resolved. See the dispute below.
          </p>
        ) : null}
        {b.status === "COMPLETED" ? (
          <p className="text-graphite">This rental is complete. Thank you.</p>
        ) : null}
        {b.status === "CANCELLED" || b.status === "REJECTED" || b.status === "EXPIRED" ? (
          <p className="text-graphite">
            This booking is closed ({(b.closedReason ?? "").toLowerCase().replace(/_/g, " ")}).
          </p>
        ) : null}

        {(b.status === "CONFIRMED" && (today >= b.startDate || handover !== undefined)) ||
        b.status === "ACTIVE" ||
        b.status === "RETURNED" ? (
          role !== "ADMIN" ? (
            <details className="border-t border-rule pt-4">
              <summary className="cursor-pointer text-sm text-graphite">Report a problem</summary>
              <div className="mt-4">
                <CommandForm {...cmd} name="openDispute" label="Open a dispute" variant="danger">
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">What went wrong</span>
                    <select name="kind" className={field} defaultValue="">
                      <option value="" disabled>
                        Choose
                      </option>
                      {disputeKindsFor(b.status, role).map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">Describe it</span>
                    <textarea name="description" rows={3} required minLength={20} className={field} />
                  </label>
                  {b.status === "RETURNED" && role === "OWNER" ? (
                    <label className="flex flex-col gap-1">
                      <span className="eyebrow text-graphite">
                        Amount claimed from the deposit (₹, at most{" "}
                        {formatInr(b.money.depositPaise - (b.money.lateFeePaise ?? 0))})
                      </span>
                      <input name="claimedRupees" type="number" min={1} className={field} />
                    </label>
                  ) : null}
                </CommandForm>
              </div>
            </details>
          ) : null
        ) : null}

        {role === "ADMIN" && (b.status === "AWAITING_PAYMENT" || b.status === "CONFIRMED") ? (
          <details className="border-t border-rule pt-4">
            <summary className="cursor-pointer text-sm text-burgundy">
              Administrator: cancel this booking
            </summary>
            <div className="mt-4">
              <CommandForm {...cmd} name="cancel" label="Cancel as administrator" variant="danger">
                <ReasonInput required />
                <label className="flex flex-col gap-1">
                  <span className="eyebrow text-graphite">Rental fee retained for the owner (₹)</span>
                  <input
                    name="retainedFeeRupees"
                    type="number"
                    min={0}
                    max={b.money.rentalFeePaise / 100}
                    defaultValue={0}
                    className={field}
                  />
                </label>
              </CommandForm>
            </div>
          </details>
        ) : null}
      </section>

      <aside className="flex flex-col gap-10 lg:col-span-5">
        <section aria-labelledby="money">
          <h2 id="money" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
            Money
          </h2>
          <DefinitionList
            className="border-t-0"
            items={[
              { term: "Rental fee", value: formatInr(b.money.rentalFeePaise) },
              { term: "Refundable deposit", value: formatInr(b.money.depositPaise) },
              {
                term: "Renter pays",
                value: <strong className="numeral">{formatInr(b.money.renterTotalPaise)}</strong>,
              },
              ...(role !== "RENTER"
                ? [
                    { term: "Peti commission", value: formatInr(b.money.commissionPaise) },
                    { term: "Owner receives", value: formatInr(b.money.ownerPayoutPaise) },
                  ]
                : []),
              {
                term: "Payment",
                value: b.payment
                  ? `${b.payment.status.toLowerCase()} (${b.payment.provider})`
                  : "Not started",
              },
              ...(b.deposit
                ? [
                    {
                      term: "Deposit",
                      value: `${b.deposit.status.toLowerCase().replace("_", " ")}${b.deposit.withheldPaise ? ` · ${formatInr(b.deposit.withheldPaise)} withheld` : ""}`,
                    },
                  ]
                : []),
              ...b.refunds.map((r) => ({
                term: `Refund · ${r.reason.toLowerCase().replace(/_/g, " ")}`,
                value: `${formatInr(r.amountPaise)} · ${r.status.toLowerCase()}`,
              })),
              ...(b.payout && role !== "RENTER"
                ? [
                    {
                      term: "Payout to owner",
                      value: `${formatInr(b.payout.netPaise)} · ${b.payout.status.toLowerCase()}${b.payout.reference ? ` · ref ${b.payout.reference}` : ""}`,
                    },
                  ]
                : []),
            ]}
          />
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
            {role === "RENTER" ? "The owner" : role === "OWNER" ? "The renter" : "Participants"}
          </h2>
          {role === "ADMIN" ? (
            <DefinitionList
              className="border-t-0"
              items={[
                { term: "Owner", value: `${b.owner.name} · ${b.owner.phone ?? "—"}` },
                { term: "Renter", value: `${b.renter.name} · ${b.renter.phone ?? "—"}` },
              ]}
            />
          ) : counterpart.phone ? (
            <DefinitionList
              className="border-t-0"
              items={[
                { term: "Name", value: counterpart.name },
                { term: "Mobile", value: <a href={`tel:${counterpart.phone}`}>{counterpart.phone}</a> },
                ...(b.pickupAddress ? [{ term: "Pickup", value: b.pickupAddress }] : []),
              ]}
            />
          ) : (
            <p className="mt-3 text-sm text-graphite">
              {counterpart.name}. Contact details and the pickup address are shared once the booking is paid.
              Pickup is in {b.outfit.localityName}.
            </p>
          )}
        </section>
      </aside>

      {b.reports.length ? (
        <section aria-labelledby="reports" className="lg:col-span-12">
          <SectionIndex index={2}>Condition</SectionIndex>
          <h2 id="reports" className="mt-3 mb-6 text-display-sm">
            Condition reports
          </h2>
          <div className="grid gap-10 md:grid-cols-2">
            {[handover, returned].filter(Boolean).map((r) => (
              <article key={r!.kind} className="flex flex-col gap-3 border-t border-ink pt-4">
                <p className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-xl">
                    {r!.kind === "HANDOVER" ? "At handover" : "At return"}
                  </span>
                  <Tag>{conditionLabel[r!.grade] ?? r!.grade}</Tag>
                </p>
                <p className="text-sm text-graphite">
                  By {r!.authorName}, {instant.format(r!.createdAt)}
                  {r!.acknowledgedAt ? ` · acknowledged ${instant.format(r!.acknowledgedAt)}` : ""}
                </p>
                <p>{r!.notes}</p>
                {r!.counterpartyNotes ? (
                  <p className="text-sm text-graphite">Renter&rsquo;s note: {r!.counterpartyNotes}</p>
                ) : null}
                <ul className="grid grid-cols-3 gap-2">
                  {r!.photoKeys.map((key) => (
                    <li key={key} className="relative aspect-square overflow-hidden bg-sand">
                      <a href={fileUrl(key)} target="_blank" rel="noreferrer">
                        <Image
                          src={fileUrl(key)}
                          alt={`${r!.kind === "HANDOVER" ? "Handover" : "Return"} photograph`}
                          fill
                          sizes="200px"
                          className="object-cover"
                          unoptimized
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {b.dispute ? (
        <section aria-labelledby="dispute" className="lg:col-span-7">
          <SectionIndex index={3}>Dispute</SectionIndex>
          <h2 id="dispute" className="mt-3 text-display-sm">
            {b.dispute.kind.toLowerCase().replace(/_/g, " ")}
          </h2>
          <p className="mt-2 text-sm text-graphite">
            Opened by the {b.dispute.openedByRole.toLowerCase()}
            {b.dispute.claimedAmountPaise ? ` · claim ${formatInr(b.dispute.claimedAmountPaise)}` : ""} ·{" "}
            {b.dispute.status.toLowerCase()}
            {b.dispute.resolution ? ` · ${b.dispute.resolution.toLowerCase().replace(/_/g, " ")}` : ""}
          </p>
          <p className="mt-4">{b.dispute.description}</p>
          {b.dispute.resolutionNotes ? (
            <Notice title="Decision" className="mt-4">
              {b.dispute.resolutionNotes}
            </Notice>
          ) : null}
          <ol className="mt-6 flex flex-col gap-4 border-t border-rule pt-4">
            {b.dispute.messages.map((m, i) => (
              <li key={i} className="text-sm">
                <p className="eyebrow text-graphite">
                  {m.authorName} · {instant.format(m.createdAt)}
                </p>
                <p className="mt-1">{m.body}</p>
              </li>
            ))}
          </ol>
          {disputeOpen ? (
            <div className="mt-6 flex flex-col gap-6">
              <CommandForm {...cmd} name="addDisputeMessage" label="Add to the dispute">
                <textarea
                  name="body"
                  rows={3}
                  required
                  minLength={2}
                  maxLength={2000}
                  className={field}
                  aria-label="Message"
                />
              </CommandForm>
              {role === "RENTER" &&
              b.dispute.openedByRole === "OWNER" &&
              b.dispute.claimedAmountPaise &&
              b.dispute.openedFromStatus === "RETURNED" ? (
                <CommandForm
                  {...cmd}
                  name="acceptClaim"
                  label={`Accept the claim of ${formatInr(b.dispute.claimedAmountPaise)}`}
                  variant="primary"
                />
              ) : null}
              {isOpener && b.dispute.openedFromStatus === "RETURNED" ? (
                <CommandForm {...cmd} name="withdrawDispute" label="Withdraw my claim" variant="quiet" />
              ) : null}
              {role === "ADMIN" ? (
                <CommandForm {...cmd} name="resolveDispute" label="Record decision" variant="primary">
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">Outcome</span>
                    <select name="outcome" className={field} defaultValue="COMPLETE">
                      <option value="COMPLETE">Rental happened — complete it</option>
                      <option value="CANCEL">Rental did not happen — cancel it</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">
                      Deposit withheld for the owner (₹, max {b.money.depositPaise / 100})
                    </span>
                    <input
                      name="depositWithheldRupees"
                      type="number"
                      min={0}
                      max={b.money.depositPaise / 100}
                      defaultValue={(b.money.lateFeePaise ?? 0) / 100}
                      className={field}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">
                      Rental fee retained for the owner (₹, max {b.money.rentalFeePaise / 100})
                    </span>
                    <input
                      name="retainedFeeRupees"
                      type="number"
                      min={0}
                      max={b.money.rentalFeePaise / 100}
                      defaultValue={b.money.rentalFeePaise / 100}
                      className={field}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-graphite">
                      Reasons (shared with both parties, kept in the audit log)
                    </span>
                    <textarea name="notes" rows={3} required minLength={10} className={field} />
                  </label>
                </CommandForm>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="timeline" className={b.dispute ? "lg:col-span-5" : "lg:col-span-12"}>
        <h2 id="timeline" className="border-b border-ink pb-2 eyebrow font-sans text-graphite">
          Timeline
        </h2>
        <ol className="mt-2">
          {b.history.map((h, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-4 border-b border-rule py-3 text-sm">
              <span>
                {statusLabel[h.toStatus as keyof typeof statusLabel] ?? h.toStatus}
                <span className="text-stone"> · {h.actorRole.toLowerCase()}</span>
                {h.reason ? <span className="block text-graphite">{h.reason}</span> : null}
              </span>
              <span className="text-graphite numeral">{instant.format(h.createdAt)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-caption text-stone">
          Requested {instant.format(b.createdAt)} · {now ? "times in IST" : ""}
        </p>
      </section>
    </div>
  );
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function disputeKindsFor(status: string, role: Role): Array<[string, string]> {
  const all: Record<string, string> = {
    HANDOVER_FAILED: "The handover did not happen",
    NOT_AS_DESCRIBED: "The outfit is not as described",
    NOT_RETURNED: "The outfit has not been returned",
    RETURN_NOT_ACKNOWLEDGED: "I returned it but it is not recorded",
    DAMAGE: "It came back damaged",
    MISSING_ITEMS: "Pieces are missing",
    LATE_FEE_CONTESTED: "I disagree with the late fee",
    OTHER: "Something else",
  };
  const allowed: Record<string, Partial<Record<Role, string[]>>> = {
    CONFIRMED: {
      RENTER: ["HANDOVER_FAILED", "NOT_AS_DESCRIBED", "OTHER"],
      OWNER: ["HANDOVER_FAILED", "OTHER"],
    },
    ACTIVE: { OWNER: ["NOT_RETURNED", "OTHER"], RENTER: ["RETURN_NOT_ACKNOWLEDGED", "OTHER"] },
    RETURNED: { OWNER: ["DAMAGE", "MISSING_ITEMS"], RENTER: ["LATE_FEE_CONTESTED"] },
  };
  return (allowed[status]?.[role] ?? []).map((k) => [k, all[k]!]);
}
