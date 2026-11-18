/**
 * Plain-language labels for the codes stored on a booking, so pages never show raw values like
 * PAYMENT_TIMEOUT. An unknown code falls back to a readable version of itself.
 */
const humanise = (code: string) => {
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const label =
  (map: Readonly<Record<string, string>>) =>
  (code: string | null | undefined): string =>
    code ? (map[code] ?? humanise(code)) : "";

export const closedReasonLabel = label({
  OWNER_DECLINED: "the owner declined the request",
  DATES_UNAVAILABLE: "the dates were no longer free",
  APPROVAL_TIMEOUT: "the owner did not answer in time",
  PAYMENT_TIMEOUT: "it was not paid in time",
  RENTER_CANCELLED: "cancelled by the renter",
  OWNER_CANCELLED: "cancelled by the owner",
  ADMIN_CANCELLED: "cancelled by a Peti administrator",
  DISPUTE_RESOLUTION: "closed by a dispute decision",
});

export const DISPUTE_KIND_LABELS: Readonly<Record<string, string>> = {
  HANDOVER_FAILED: "The handover did not happen",
  NOT_AS_DESCRIBED: "The outfit is not as described",
  NOT_RETURNED: "The outfit has not been returned",
  RETURN_NOT_ACKNOWLEDGED: "I returned it but it is not recorded",
  DAMAGE: "It came back damaged",
  MISSING_ITEMS: "Pieces are missing",
  LATE_FEE_CONTESTED: "I disagree with the late fee",
  OTHER: "Something else",
};

/** The dispute as a heading (not in the first person, unlike the options in the form). */
export const disputeKindLabel = label({
  HANDOVER_FAILED: "Handover did not happen",
  NOT_AS_DESCRIBED: "Not as described",
  NOT_RETURNED: "Not returned",
  RETURN_NOT_ACKNOWLEDGED: "Return not recorded",
  DAMAGE: "Damage",
  MISSING_ITEMS: "Missing pieces",
  LATE_FEE_CONTESTED: "Late fee contested",
  OTHER: "Other problem",
});

export const disputeStatusLabel = label({ OPEN: "open", RESOLVED: "resolved" });

export const disputeResolutionLabel = label({
  RESPONDENT_ACCEPTED: "the other side accepted the claim",
  WITHDRAWN: "withdrawn",
  ADMIN_DECISION: "decided by a Peti administrator",
});

export const roleLabel = label({
  RENTER: "renter",
  OWNER: "owner",
  ADMIN: "Peti administrator",
  SYSTEM: "Peti (automatic)",
});

export const paymentStatusLabel = label({
  CREATED: "checkout started",
  AUTHORIZED: "authorised, being taken",
  CAPTURED: "paid",
  ABANDONED: "not completed",
});

export const depositStatusLabel = label({
  HELD: "held",
  RELEASED: "released in full",
  PARTIALLY_WITHHELD: "partly withheld",
  FORFEITED: "withheld",
});

export const refundReasonLabel = label({
  CANCELLATION: "cancellation",
  DEPOSIT_RELEASE: "deposit",
  DISPUTE_RESOLUTION: "dispute decision",
  LATE_CAPTURE_REVERSAL: "late payment returned",
  ADMIN_ADJUSTMENT: "adjustment by Peti",
  UNEXPECTED_CAPTURE_REVERSAL: "extra payment returned",
});

export const refundStatusLabel = label({
  PENDING: "queued, sent with the next background run",
  INITIATED: "sent to the payment provider",
  PROCESSED: "refunded",
  FAILED: "failed, Peti will retry",
});

export const payoutStatusLabel = label({
  PENDING: "to be paid by Peti",
  PAID: "paid",
  CANCELLED: "cancelled",
  FAILED: "failed, to be paid again",
});

/** The payment provider, saying plainly when it is the simulated one. */
export const providerLabel = (provider: string) =>
  provider === "sandbox" ? "simulated sandbox" : provider === "razorpay" ? "Razorpay" : provider;
