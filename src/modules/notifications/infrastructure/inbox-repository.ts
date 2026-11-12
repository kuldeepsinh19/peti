import "server-only";
import type { Db } from "@/shared/infrastructure/prisma";
import type { InboxRepository } from "../application/inbox";

export function prismaInboxRepository(db: Db): InboxRepository {
  return {
    async list(userId, limit) {
      const rows = await db.notification.findMany({
        where: { userId, channel: "IN_APP" },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((n) => ({
        id: n.id,
        subject: n.subject,
        body: n.body,
        link: n.link,
        createdAt: n.createdAt,
        read: n.readAt !== null,
      }));
    },
    unreadCount: (userId) => db.notification.count({ where: { userId, channel: "IN_APP", readAt: null } }),
    async markAllRead(userId, at) {
      await db.notification.updateMany({
        where: { userId, channel: "IN_APP", readAt: null },
        data: { readAt: at },
      });
    },
  };
}
