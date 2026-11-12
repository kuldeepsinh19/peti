import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isDevToolingEnabled } from "@/config/env";

/**
 * Cheap redirect for anonymous visitors to signed-in areas. This only checks that a session cookie
 * exists; it is NOT the security boundary — every page, action and use case validates the session and
 * authorises the actor on the server.
 */
export function proxy(request: NextRequest) {
  // Development tooling (dev outbox, sandbox checkout, design system) does not exist outside local/test.
  // Checked here as well as in the /dev layout, so no rendering path can reach it.
  if (request.nextUrl.pathname.startsWith("/dev")) {
    return isDevToolingEnabled() ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  }
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dev/:path*",
    "/account/:path*",
    "/lend/(dashboard|outfits|requests|history|earnings)/:path*",
    "/admin/:path*",
  ],
};
