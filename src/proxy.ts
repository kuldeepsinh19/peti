import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Cheap redirect for anonymous visitors to signed-in areas. This only checks that a session cookie
 * exists; it is NOT the security boundary — every page, action and use case validates the session and
 * authorises the actor on the server.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/lend/:path*", "/admin/:path*"],
};
