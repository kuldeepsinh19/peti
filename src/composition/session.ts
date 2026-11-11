import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { UserActor } from "@/shared/application/actor";
import { container } from "./container";

/**
 * Resolves the signed-in user from the session cookie, validated against the database on every request
 * (never trusted from the client). Cached per request.
 */
export const getActor = cache(async (): Promise<UserActor | null> => {
  const session = await container().auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & {
    role?: string | null;
    banned?: boolean | null;
    phoneNumberVerified?: boolean | null;
  };
  if (user.banned) return null;
  const profile = await container().db.userProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true },
  });
  return {
    kind: "user",
    userId: user.id,
    displayName: profile?.displayName ?? user.name,
    email: user.email,
    isAdmin: user.role === "admin",
    emailVerified: user.emailVerified,
    phoneVerified: Boolean(user.phoneNumberVerified),
  };
});

/** For pages that require a signed-in user: redirects to sign-in with a return path. */
export async function requireActorOrRedirect(returnTo: string): Promise<UserActor> {
  const actor = await getActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return actor;
}

export async function requireAdminOrNotFound(): Promise<UserActor> {
  const actor = await requireActorOrRedirect("/admin");
  if (!actor.isAdmin) notFound();
  return actor;
}
