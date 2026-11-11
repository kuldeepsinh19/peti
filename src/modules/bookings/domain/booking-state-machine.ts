import { PreconditionError } from "@/shared/domain/errors";

/** The ten booking states (docs/architecture/booking-lifecycle.md). */
export const BOOKING_STATUSES = [
  "PENDING_APPROVAL",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "ACTIVE",
  "RETURNED",
  "DISPUTED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type BookingActorRole = "RENTER" | "OWNER" | "ADMIN" | "SYSTEM";

export type BookingCommand =
  | "approve"
  | "reject"
  | "autoRejectDatesTaken"
  | "withdraw"
  | "expireApproval"
  | "confirmPayment"
  | "expirePayment"
  | "cancel"
  | "acknowledgeHandover"
  | "openDispute"
  | "recordReturn"
  | "confirmReturn"
  | "autoComplete"
  | "resolveDispute";

export interface Transition {
  from: BookingStatus;
  to: BookingStatus;
  command: BookingCommand;
  actors: readonly BookingActorRole[];
}

/**
 * The only legal status changes. The database holds the same (from, to) pairs in
 * booking_allowed_transitions and rejects anything else; an integration test keeps them identical.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: "PENDING_APPROVAL", to: "AWAITING_PAYMENT", command: "approve", actors: ["OWNER"] },
  { from: "PENDING_APPROVAL", to: "REJECTED", command: "reject", actors: ["OWNER", "ADMIN"] },
  { from: "PENDING_APPROVAL", to: "REJECTED", command: "autoRejectDatesTaken", actors: ["SYSTEM"] },
  { from: "PENDING_APPROVAL", to: "CANCELLED", command: "withdraw", actors: ["RENTER", "ADMIN"] },
  { from: "PENDING_APPROVAL", to: "EXPIRED", command: "expireApproval", actors: ["SYSTEM"] },
  { from: "AWAITING_PAYMENT", to: "CONFIRMED", command: "confirmPayment", actors: ["SYSTEM"] },
  { from: "AWAITING_PAYMENT", to: "EXPIRED", command: "expirePayment", actors: ["SYSTEM"] },
  { from: "AWAITING_PAYMENT", to: "CANCELLED", command: "cancel", actors: ["RENTER", "OWNER", "ADMIN"] },
  { from: "CONFIRMED", to: "ACTIVE", command: "acknowledgeHandover", actors: ["RENTER", "ADMIN"] },
  { from: "CONFIRMED", to: "CANCELLED", command: "cancel", actors: ["RENTER", "OWNER", "ADMIN"] },
  { from: "CONFIRMED", to: "DISPUTED", command: "openDispute", actors: ["RENTER", "OWNER", "ADMIN"] },
  { from: "ACTIVE", to: "RETURNED", command: "recordReturn", actors: ["OWNER", "ADMIN"] },
  { from: "ACTIVE", to: "DISPUTED", command: "openDispute", actors: ["RENTER", "OWNER", "ADMIN", "SYSTEM"] },
  { from: "RETURNED", to: "COMPLETED", command: "confirmReturn", actors: ["OWNER", "ADMIN"] },
  { from: "RETURNED", to: "COMPLETED", command: "autoComplete", actors: ["SYSTEM"] },
  { from: "RETURNED", to: "DISPUTED", command: "openDispute", actors: ["RENTER", "OWNER", "ADMIN"] },
  { from: "DISPUTED", to: "COMPLETED", command: "resolveDispute", actors: ["RENTER", "OWNER", "ADMIN"] },
  { from: "DISPUTED", to: "CANCELLED", command: "resolveDispute", actors: ["ADMIN"] },
];

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"];

/** States in which the booking occupies the outfit's calendar (ADR-004). */
export const HOLDING_STATUSES: readonly BookingStatus[] = [
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "ACTIVE",
  "RETURNED",
  "DISPUTED",
  "COMPLETED",
];

/** Bookings that are still "in progress" for the purposes of archiving a listing or opening disputes. */
export const OPEN_STATUSES: readonly BookingStatus[] = [
  "PENDING_APPROVAL",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "ACTIVE",
  "RETURNED",
  "DISPUTED",
];

export function holdsCalendar(status: BookingStatus): boolean {
  return HOLDING_STATUSES.includes(status);
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export class InvalidTransitionError extends PreconditionError {
  constructor(from: BookingStatus, command: BookingCommand, role: BookingActorRole) {
    super(
      "INVALID_TRANSITION",
      `This booking cannot be ${commandVerb[command]} while it is ${statusLabel[from].toLowerCase()}.`,
      { from, command, role },
    );
  }
}

/**
 * Resolves the target state of a command, or throws. `to` disambiguates commands with two possible
 * targets (an admin resolving a dispute may complete or cancel the booking).
 */
export function resolveTransition(
  from: BookingStatus,
  command: BookingCommand,
  role: BookingActorRole,
  to?: BookingStatus,
): BookingStatus {
  const match = TRANSITIONS.find(
    (t) =>
      t.from === from &&
      t.command === command &&
      t.actors.includes(role) &&
      (to === undefined || t.to === to),
  );
  if (!match) throw new InvalidTransitionError(from, command, role);
  return match.to;
}

export function allowedPairs(): Array<[BookingStatus, BookingStatus]> {
  const seen = new Set<string>();
  const pairs: Array<[BookingStatus, BookingStatus]> = [];
  for (const t of TRANSITIONS) {
    const key = `${t.from}->${t.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([t.from, t.to]);
    }
  }
  return pairs;
}

export const statusLabel: Record<BookingStatus, string> = {
  PENDING_APPROVAL: "Awaiting the owner",
  AWAITING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  ACTIVE: "With the renter",
  RETURNED: "Returned — being checked",
  DISPUTED: "In dispute",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
  EXPIRED: "Expired",
};

const commandVerb: Record<BookingCommand, string> = {
  approve: "approved",
  reject: "declined",
  autoRejectDatesTaken: "declined",
  withdraw: "withdrawn",
  expireApproval: "expired",
  confirmPayment: "confirmed",
  expirePayment: "expired",
  cancel: "cancelled",
  acknowledgeHandover: "handed over",
  openDispute: "disputed",
  recordReturn: "returned",
  confirmReturn: "completed",
  autoComplete: "completed",
  resolveDispute: "resolved",
};
