import { NextResponse, type NextRequest } from "next/server";
import { readCookie, SESSION_COOKIE, verifyJwtOnly } from "@/lib/auth/edge";

/**
 * Auth gate (Next 16 "proxy" convention — formerly middleware.ts). Runs on the edge runtime
 * (jose only). Anything that is not a public path requires a valid signed session; app pages
 * redirect to /login, API routes return 401. Deep revocation/expiry (DB) is enforced in the
 * Node route handlers via verifySession.
 */

// /api/webhooks + /api/n8n are HMAC-verified inside their handlers — external callers have no
// session cookie, so they must be public at the gate (they enforce their own signatures).
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health", "/api/webhooks", "/api/n8n", "/_next", "/favicon", "/robots", "/manifest", "/icon"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const claims = token ? await verifyJwtOnly(token) : null;
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthenticated — please log in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
