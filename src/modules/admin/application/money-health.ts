import type { Actor } from "@/shared/application/actor";
import { requireAdmin } from "@/shared/application/authorization";

/**
 * What an operator has to look at in the money pipeline (ADR-006). Every count is 0 when all is well.
 * The thresholds live in the query (prisma-money-queries.ts), next to the SQL they apply to.
 */
export interface MoneyHealthCounts {
  /** Stray captures whose reversal refund has not reached the payer yet. */
  unexpectedCapturesOutstanding: number;
  /** Refunds the provider refused after every retry: an administrator retries them. */
  refundsFailed: number;
  /** Refunds queued but not sent for hours: the sweep is not running. */
  refundsNotSent: number;
  /** Refunds sent long ago that the provider still has not settled. */
  refundsStuck: number;
  /** Closed bookings where captured ≠ refunded + owner payout + commission. Must always be 0. */
  reconciliationImbalances: number;
  /** Authorised payments Peti has not managed to capture. */
  authorizationsWaiting: number;
  /** Webhooks that failed processing in the last 7 days. */
  providerEventsFailed: number;
  /** Open chargebacks: evidence is due at the provider, and the owner's payout waits. */
  chargebacksOpen: number;
  /** Payouts that came back and have not been sent again. */
  payoutsFailed: number;
  /** Chargebacks lost in the last 30 days (information: the money has gone back to the payer). */
  chargebacksLostRecently: number;
}

export interface MoneyHealth {
  ok: boolean;
  /** The counts that need someone to act. */
  attention: Array<keyof MoneyHealthCounts>;
  counts: MoneyHealthCounts;
}

/** Counts that are shown but do not, alone, mean something is wrong. */
const INFORMATIONAL: ReadonlySet<keyof MoneyHealthCounts> = new Set(["chargebacksLostRecently"]);

export function summarizeMoneyHealth(counts: MoneyHealthCounts): MoneyHealth {
  const attention = (Object.keys(counts) as Array<keyof MoneyHealthCounts>).filter(
    (key) => counts[key] > 0 && !INFORMATIONAL.has(key),
  );
  return { ok: attention.length === 0, attention, counts };
}

export interface MoneyAttention {
  unexpectedCaptures: Array<{
    refundId: string;
    bookingId: string;
    reference: string;
    amountPaise: number;
    status: string;
    lastError: string | null;
    createdAt: Date;
  }>;
  chargebacks: Array<{
    id: string;
    bookingId: string | null;
    reference: string | null;
    amountPaise: number;
    reasonCode: string | null;
    status: string;
    createdAt: Date;
  }>;
  authorizations: Array<{
    bookingId: string;
    reference: string;
    amountPaise: number;
    captureAttempts: number;
    lastCaptureError: string | null;
    updatedAt: Date;
  }>;
  failedEvents: Array<{ id: number; eventType: string; lastError: string | null; receivedAt: Date }>;
}

export interface MoneyTimeline {
  payment: {
    status: string;
    provider: string;
    amountPaise: number;
    refundedPaise: number;
    captureAttempts: number;
    lastCaptureError: string | null;
    lastReconciledAt: Date | null;
  } | null;
  chargebacks: Array<{
    id: string;
    status: string;
    amountPaise: number;
    reasonCode: string | null;
    at: Date;
  }>;
  /** Money events from the audit log, oldest first. */
  events: Array<{
    id: number;
    at: Date;
    action: string;
    actorRole: string;
    detail: Record<string, unknown> | null;
    reason: string | null;
  }>;
}

export interface MoneyQueries {
  counts(): Promise<MoneyHealthCounts>;
  attention(): Promise<MoneyAttention>;
  timeline(bookingId: string): Promise<MoneyTimeline>;
}

export function moneyUseCases(queries: MoneyQueries) {
  return {
    async health(actor: Actor) {
      requireAdmin(actor);
      const [counts, attention] = await Promise.all([queries.counts(), queries.attention()]);
      return { ...summarizeMoneyHealth(counts), lists: attention };
    },

    async timeline(actor: Actor, bookingId: string) {
      requireAdmin(actor);
      return queries.timeline(bookingId);
    },

    /**
     * For the monitoring endpoint, which authenticates with the scheduler secret instead of a session.
     * Counts only: no names, references or amounts leave the application this way.
     */
    monitor: async () => summarizeMoneyHealth(await queries.counts()),
  };
}

export type MoneyUseCases = ReturnType<typeof moneyUseCases>;
