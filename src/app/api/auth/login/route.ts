import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountDisabledError, InvalidCredentialsError, login, sessionCookie } from "@/lib/auth";
import { loginRateLimiter, clientKeyFromRequest } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The body carries ONLY a credential pair. There is deliberately no `founder` field any more: the
 * acting founder is derived from the authenticated account, so a caller cannot name who they are.
 */
const schema = z.object({ email: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) });

/** POST /api/auth/login — a founder's own email + password → session cookie. Rate-limited (WOB-AUD-009). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  // Lockout gate: block online brute-force against a founder's password.
  const clientKey = clientKeyFromRequest(request);
  const gate = loginRateLimiter.check(clientKey);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, error: "too many login attempts — try again later" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    const result = await login(parsed.data);
    loginRateLimiter.recordSuccess(clientKey);
    const res = NextResponse.json({ ok: true, founder: result.founder, isSuperAdmin: result.isSuperAdmin });
    res.headers.set("Set-Cookie", sessionCookie(result.token));
    return res;
  } catch (error) {
    // A wrong password and an unknown email are BOTH InvalidCredentialsError with the same opaque
    // message, so this endpoint cannot be used to discover which founder emails exist.
    if (error instanceof InvalidCredentialsError) {
      loginRateLimiter.recordFailure(clientKey);
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    if (error instanceof AccountDisabledError) {
      // Credentials were correct, so this is a real attempt — still counts toward the lockout.
      loginRateLimiter.recordFailure(clientKey);
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "login failed";
    const status = /not configured/.test(message) ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
