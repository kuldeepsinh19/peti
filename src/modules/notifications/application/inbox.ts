import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";

export interface InboxItem {
  id: string;
  subject: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
}

export interface InboxRepository {
  list(userId: string, limit: number): Promise<InboxItem[]>;
  unreadCount(userId: string): Promise<number>;
  markAllRead(userId: string, at: Date): Promise<void>;
}

/** In-app notifications: each user only ever sees and changes their own. */
export function inboxUseCases({ inbox, clock }: { inbox: InboxRepository; clock: { now(): Date } }) {
  return {
    list: (actor: Actor) => inbox.list(requireUser(actor).userId, 100),
    unreadCount: (actor: Actor) => inbox.unreadCount(requireUser(actor).userId),
    markAllRead: (actor: Actor) => inbox.markAllRead(requireUser(actor).userId, clock.now()),
  };
}
