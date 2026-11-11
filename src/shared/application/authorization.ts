import { ForbiddenError, PreconditionError, UnauthenticatedError } from "../domain/errors";
import type { Actor, UserActor } from "./actor";

export function requireUser(actor: Actor | null | undefined): UserActor {
  if (!actor || actor.kind !== "user") throw new UnauthenticatedError();
  return actor;
}

export function requireAdmin(actor: Actor | null | undefined): UserActor {
  const user = requireUser(actor);
  if (!user.isAdmin) throw new ForbiddenError("Only administrators can do that.");
  return user;
}

/** Renting and lending need confirmed contact details: the counterparty must be able to reach you. */
export function requireVerifiedContact(actor: Actor | null | undefined): UserActor {
  const user = requireUser(actor);
  if (!user.emailVerified) {
    throw new PreconditionError("EMAIL_NOT_VERIFIED", "Please confirm your email address first.");
  }
  if (!user.phoneVerified) {
    throw new PreconditionError("PHONE_NOT_VERIFIED", "Please verify your mobile number first.");
  }
  return user;
}
