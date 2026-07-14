import { NextResponse } from "next/server";
import { z } from "zod";
import { login, sessionCookie } from "@/lib/auth";
import { loginRateLimiter, clientKeyFromRequest } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().min(1), founder: z.string().trim().min(1) });

/** POST /api/auth/login — shared team password + chosen founder → session cookie. Rate-limited (WOB-AUD-009). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  // Lockout gate: block online brute-force against the shared password.
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
    const res = NextResponse.json({ ok: true, founder: result.founder });
    res.headers.set("Set-Cookie", sessionCookie(result.token));
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "login failed";
    const status = /invalid password|unknown founder/.test(message) ? 401 : /not configured/.test(message) ? 503 : 500;
    // Count credential failures toward the lockout (not config/500 errors).
    if (status === 401) loginRateLimiter.recordFailure(clientKey);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
