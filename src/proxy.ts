import { NextResponse, type NextRequest } from "next/server";
import { readCookie, SESSION_COOKIE, verifyJwtOnly } from "@/lib/auth/edge";

/**
 * Auth gate (Next 16 "proxy" convention — formerly middleware.ts). Runs on the edge runtime
 * (jose only). Anything that is not a public path requires a valid signed session; app pages
 * redirect to /login, API routes return 401. Deep revocation/expiry (DB) is enforced in the
 * Node route handlers via verifySession.
 */

// Public route prefixes matched with a STRICT slash boundary (exact path or a real sub-path). A sibling
// like `/api/n8nSomething` is NOT made public by `/api/n8n/callback` (WOB-AUD-020).
// Only the n8n CALLBACK is public — it is timestamped-HMAC verified for external callers with no session
// cookie. The n8n registry (`/api/n8n`) and outbound handoff trigger are NOT public: they require a
// founder session + DB-backed authorization in their handlers (WOB-AUD-005). /api/webhooks/* are
// raw-body HMAC verified for external senders.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health", "/api/webhooks", "/api/n8n/callback", "/api/public/media", "/_next"];
// Static assets served as files (favicon.ico, robots.txt, manifest.webmanifest, icon-*.png). Matched as
// filename prefixes because they are concrete files, not route trees.
const PUBLIC_FILE_PREFIXES = ["/favicon", "/robots", "/manifest", "/icon", "/apple-icon", "/sitemap"];

export function isPublic(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return PUBLIC_FILE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
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
