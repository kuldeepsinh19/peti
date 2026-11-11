/** Append-only record of sensitive operations (admin decisions, payouts, suspensions, refunds). */
export interface AuditEntry {
  actorUserId: string | null;
  actorRole: "RENTER" | "OWNER" | "ADMIN" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
