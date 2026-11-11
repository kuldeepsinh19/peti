import { addDays, localDateInIndia } from "@/shared/domain/local-date";
import { applyTransition, loadBooking, settleMoney } from "./core";
import type { BookingsDeps } from "./ports";

export interface SweepCandidates {
  expiredApprovals(now: Date): Promise<string[]>;
  expiredPayments(now: Date): Promise<string[]>;
  inspectionsDue(now: Date): Promise<string[]>;
  overdueRentals(beforeEndDate: string): Promise<string[]>;
}

export interface SweepReport {
  expiredApprovals: number;
  expiredPayments: number;
  autoCompleted: number;
  autoDisputed: number;
  errors: number;
}

/**
 * Applies deadlines. Each booking is handled in its own short transaction with a status re-check, so the
 * sweep is idempotent and safe to run concurrently with user actions or another sweep.
 */
export async function runBookingSweep(deps: BookingsDeps, candidates: SweepCandidates): Promise<SweepReport> {
  const now = deps.clock.now();
  const report: SweepReport = {
    expiredApprovals: 0,
    expiredPayments: 0,
    autoCompleted: 0,
    autoDisputed: 0,
    errors: 0,
  };
  const attempt = async (key: keyof Omit<SweepReport, "errors">, work: () => Promise<boolean>) => {
    try {
      if (await work()) report[key]++;
    } catch {
      report.errors++;
    }
  };

  for (const id of await candidates.expiredApprovals(now)) {
    await attempt("expiredApprovals", () =>
      deps.uow.run(async (store) => {
        const b = await loadBooking(store, id);
        if (b.status !== "PENDING_APPROVAL" || !b.expiresAt || b.expiresAt > now) return false;
        await applyTransition(store, b, "expireApproval", "SYSTEM", {
          actorUserId: null,
          patch: { closedReason: "APPROVAL_TIMEOUT", expiresAt: null },
        });
        return true;
      }),
    );
  }

  for (const id of await candidates.expiredPayments(now)) {
    await attempt("expiredPayments", async () => {
      // A payment may have succeeded at the provider without either signal reaching us yet.
      await deps.paymentReconciler?.reconcile(id);
      return deps.uow.run(async (store) => {
        const b = await loadBooking(store, id);
        if (b.status !== "AWAITING_PAYMENT" || !b.expiresAt || b.expiresAt > now) return false;
        await store.abandonPayment(b.id);
        await applyTransition(store, b, "expirePayment", "SYSTEM", {
          actorUserId: null,
          patch: { closedReason: "PAYMENT_TIMEOUT", expiresAt: null },
        });
        return true;
      });
    });
  }

  for (const id of await candidates.inspectionsDue(now)) {
    await attempt("autoCompleted", () =>
      deps.uow.run(async (store) => {
        const b = await loadBooking(store, id);
        if (b.status !== "RETURNED" || !b.inspectionDeadline || b.inspectionDeadline > now) return false;
        if (await store.hasOpenDispute(b.id)) return false;
        await settleMoney(store, b, {
          retainedFeePaise: b.rentalFeePaise,
          lateFeePaise: b.lateFeePaise ?? 0,
          damagePaise: 0,
          basis: "AUTO_NO_CLAIM",
          refundReason: "DEPOSIT_RELEASE",
          role: "SYSTEM",
          actorUserId: null,
          at: now,
        });
        await applyTransition(store, b, "autoComplete", "SYSTEM", {
          actorUserId: null,
          patch: { completedAt: now, inspectionDeadline: null },
        });
        return true;
      }),
    );
  }

  // Candidates are rentals past their end date; each booking's own policy snapshot decides the grace period.
  const today = localDateInIndia(now);
  for (const id of await candidates.overdueRentals(today)) {
    await attempt("autoDisputed", () =>
      deps.uow.run(async (store) => {
        const b = await loadBooking(store, id);
        if (b.status !== "ACTIVE") return false;
        if (today <= addDays(b.endDate, b.policy.autoDisputeOverdueDays)) return false;
        if (await store.hasOpenDispute(b.id)) return false;
        const disputeId = await store.insertDispute({
          bookingId: b.id,
          openedById: null,
          openedByRole: "SYSTEM",
          openedFromStatus: "ACTIVE",
          kind: "NOT_RETURNED",
          description: `Opened automatically: the outfit was due back on ${b.endDate} and has not been recorded as returned.`,
          claimedAmountPaise: null,
        });
        await applyTransition(store, b, "openDispute", "SYSTEM", {
          actorUserId: null,
          reason: "NOT_RETURNED",
          metadata: { disputeId },
        });
        return true;
      }),
    );
  }
  return report;
}
