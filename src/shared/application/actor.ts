/**
 * Who is performing a use case. Built from the session by the auth module; never from client input.
 * "Owner" and "renter" are not roles: they are relationships to a particular outfit or booking, and every
 * use case checks them itself.
 */
export type Actor = UserActor | SystemActor;

export interface UserActor {
  kind: "user";
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface SystemActor {
  kind: "system";
}

export const SYSTEM_ACTOR: SystemActor = { kind: "system" };

export function isUser(actor: Actor): actor is UserActor {
  return actor.kind === "user";
}
