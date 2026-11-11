import "server-only";
import type { AuditEntry, AuditLog } from "../application/audit";
import type { DbOrTx } from "./prisma";

const json = (value: unknown) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Writes inside the caller's transaction when given one, so the audit row commits with the change. */
export function prismaAuditLog(db: DbOrTx): AuditLog {
  return {
    async record(entry: AuditEntry) {
      await db.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          actorRole: entry.actorRole,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: json(entry.before),
          after: json(entry.after),
          reason: entry.reason ?? null,
        },
      });
    },
  };
}
