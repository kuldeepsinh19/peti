import { z } from "zod";
import type { Actor } from "@/shared/application/actor";
import type { AuditLog } from "@/shared/application/audit";
import { requireAdmin } from "@/shared/application/authorization";
import { NotFoundError, PreconditionError } from "@/shared/domain/errors";
import { parseInput } from "@/shared/contracts/validation";

const BOOKING_STATUSES = [
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
const PAYOUT_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;

function knownOrUndefined(known: readonly string[], value: string | undefined) {
  return value !== undefined && known.includes(value) ? value : undefined;
}

export interface Metrics {
  users: number;
  verifiedUsers: number;
  suspendedUsers: number;
  listings: Record<string, number>;
  bookings: Record<string, number>;
  completedRentalFeePaise: number;
  commissionEarnedPaise: number;
  pendingPayoutsPaise: number;
  pendingPayouts: number;
  openDisputes: number;
  pendingRefunds: number;
  failedRefunds: number;
  reconciliationIssues: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  outfits: number;
  rentals: number;
  ownerCancellations: number;
}

export interface AdminBookingRow {
  id: string;
  reference: string;
  status: string;
  outfitTitle: string;
  ownerName: string;
  renterName: string;
  startDate: string;
  renterTotalPaise: number;
  createdAt: Date;
}

export interface AdminPayoutRow {
  id: string;
  bookingId: string;
  reference: string;
  ownerName: string;
  upiVpa: string | null;
  netPaise: number;
  status: string;
  payoutReference: string | null;
  createdAt: Date;
}

export interface AuditRow {
  id: number;
  actorName: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  createdAt: Date;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  audience: string;
  isActive: boolean;
  outfits: number;
}

export interface FailedRefundRow {
  id: string;
  bookingId: string;
  reference: string;
  amountPaise: number;
  attempts: number;
  lastError: string | null;
}

export interface AdminRepository {
  failedRefunds(): Promise<FailedRefundRow[]>;
  retryRefund(refundId: string): Promise<boolean>;
  metrics(): Promise<Metrics>;
  users(search: string | undefined): Promise<AdminUserRow[]>;
  findUser(userId: string): Promise<{ id: string; role: string; banned: boolean } | null>;
  setBanned(userId: string, banned: boolean, reason: string | null): Promise<void>;
  bookings(status: string | undefined): Promise<AdminBookingRow[]>;
  openDisputes(): Promise<AdminBookingRow[]>;
  payouts(status: string | undefined): Promise<AdminPayoutRow[]>;
  findPayout(
    payoutId: string,
  ): Promise<{ id: string; status: string; bookingId: string; netPaise: number } | null>;
  markPayoutPaid(payoutId: string, reference: string, paidBy: string, at: Date): Promise<boolean>;
  audit(limit: number): Promise<AuditRow[]>;
  categories(): Promise<CategoryRow[]>;
  createCategory(input: {
    slug: string;
    name: string;
    audience: string;
    description: string | null;
  }): Promise<string>;
  setCategoryActive(categoryId: string, active: boolean): Promise<boolean>;
}

const suspendSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(5, "Give a reason for the record.").max(500),
});
const reinstateSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(5, "Give a reason for the record.").max(500),
});
const payoutSchema = z.object({
  payoutId: z.uuid(),
  reference: z.string().trim().min(4, "Enter the UPI or bank reference (UTR).").max(64),
});
const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, "Lowercase letters, numbers and hyphens."),
  audience: z.enum(["MEN", "WOMEN", "KIDS", "UNISEX"]),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});
const refundSchema = z.object({ refundId: z.uuid() });
const toggleCategorySchema = z.object({ categoryId: z.uuid(), active: z.enum(["true", "false"]) });

/** Administration. Every function re-checks the admin role on the server and audits what it changes. */
export function adminUseCases({
  admin,
  audit,
  clock,
}: {
  admin: AdminRepository;
  audit: AuditLog;
  clock: { now(): Date };
}) {
  return {
    metrics: async (actor: Actor) => {
      requireAdmin(actor);
      return admin.metrics();
    },
    users: async (actor: Actor, search?: string) => {
      requireAdmin(actor);
      return admin.users(search?.trim() || undefined);
    },
    /** An unknown `status` (for example a hand-edited URL) is ignored rather than passed to the database. */
    bookings: async (actor: Actor, status?: string) => {
      requireAdmin(actor);
      return admin.bookings(knownOrUndefined(BOOKING_STATUSES, status));
    },
    openDisputes: async (actor: Actor) => {
      requireAdmin(actor);
      return admin.openDisputes();
    },
    payouts: async (actor: Actor, status?: string) => {
      requireAdmin(actor);
      return admin.payouts(knownOrUndefined(PAYOUT_STATUSES, status));
    },
    activity: async (actor: Actor) => {
      requireAdmin(actor);
      return admin.audit(200);
    },
    categories: async (actor: Actor) => {
      requireAdmin(actor);
      return admin.categories();
    },

    /** Suspends an account: it can no longer sign in, and its sessions end immediately. */
    async suspendUser(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const { userId, reason } = parseInput(suspendSchema, input);
      const user = await admin.findUser(userId);
      if (!user) throw new NotFoundError("User");
      if (user.id === me.userId)
        throw new PreconditionError("SELF_SUSPEND", "You cannot suspend your own account.");
      if (user.role === "admin")
        throw new PreconditionError("ADMIN_TARGET", "Administrators cannot be suspended here.");
      await admin.setBanned(userId, true, reason);
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: "user.suspend",
        entityType: "user",
        entityId: userId,
        before: { banned: user.banned },
        after: { banned: true },
        reason,
      });
    },

    async reinstateUser(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const { userId, reason } = parseInput(reinstateSchema, input);
      const user = await admin.findUser(userId);
      if (!user) throw new NotFoundError("User");
      await admin.setBanned(userId, false, null);
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: "user.reinstate",
        entityType: "user",
        entityId: userId,
        before: { banned: user.banned },
        after: { banned: false },
        reason,
      });
    },

    /** Records that a payout was sent outside the platform (UPI/bank), with its reference. */
    async markPayoutPaid(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const { payoutId, reference } = parseInput(payoutSchema, input);
      const payout = await admin.findPayout(payoutId);
      if (!payout) throw new NotFoundError("Payout");
      if (payout.status !== "PENDING")
        throw new PreconditionError("PAYOUT_NOT_PENDING", "This payout is not pending.");
      if (!(await admin.markPayoutPaid(payoutId, reference, me.userId, clock.now()))) {
        throw new PreconditionError("PAYOUT_NOT_PENDING", "This payout changed. Please reload.");
      }
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: "payout.markPaid",
        entityType: "payout",
        entityId: payoutId,
        after: { status: "PAID", reference, netPaise: payout.netPaise },
      });
    },

    failedRefunds: async (actor: Actor) => {
      requireAdmin(actor);
      return admin.failedRefunds();
    },

    /** Puts a failed refund back in the outbox; the next sweep sends it again (idempotent at the provider). */
    async retryRefund(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const { refundId } = parseInput(refundSchema, input);
      if (!(await admin.retryRefund(refundId))) throw new NotFoundError("Failed refund");
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: "refund.retry",
        entityType: "refund",
        entityId: refundId,
      });
    },

    async createCategory(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const data = parseInput(categorySchema, input);
      const id = await admin.createCategory(data);
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: "category.create",
        entityType: "category",
        entityId: id,
        after: data,
      });
    },

    async toggleCategory(actor: Actor, input: unknown) {
      const me = requireAdmin(actor);
      const { categoryId, active } = parseInput(toggleCategorySchema, input);
      if (!(await admin.setCategoryActive(categoryId, active === "true")))
        throw new NotFoundError("Category");
      await audit.record({
        actorUserId: me.userId,
        actorRole: "ADMIN",
        action: active === "true" ? "category.activate" : "category.deactivate",
        entityType: "category",
        entityId: categoryId,
      });
    },
  };
}

export type AdminUseCases = ReturnType<typeof adminUseCases>;
