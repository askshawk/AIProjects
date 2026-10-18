import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

/**
 * Everything except the sign-in page and static assets needs a session. This
 * is the first line of defence; server actions re-check with requireSignedIn().
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionToken(token, process.env.SESSION_SECRET)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  if (request.nextUrl.pathname !== "/") signIn.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    // Skip the sign-in page, Next internals, and the files a browser fetches
    // before (or without) signing in: icons, manifest, service worker.
    "/((?!sign-in|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)",
  ],
};
