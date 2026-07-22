import { NextResponse } from "next/server";
import { getActingFounder } from "@/lib/auth";
import { buildGreeting } from "@/lib/domain/greeting";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/greeting?hour=&pick= — personality greeting for the logged-in founder. */
export async function GET(request: Request) {
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const u = new URL(request.url);
  const founder = await getActingFounder(request).catch(() => null);
  // NOTE: `searchParams.get` returns null when the param is absent, and `Number(null)` is 0 — which
  // passes a bare 0..23 range check. Reading it that way pinned every greeting to hour 0 ("Late night
  // grind") at all times of day and made the server-time fallback unreachable. Test for presence first.
  // NOTE: `searchParams.get` returns null when the param is absent, and BOTH `Number(null)` and
  // `Number("")` are 0 — which passes a bare 0..23 range check. Reading it that way pinned every
  // greeting to hour 0 ("Late night grind") at all times of day and made the server-time fallback
  // unreachable. Treat absent/blank as "not supplied" before converting.
  const numParam = (key: string): number => {
    const raw = u.searchParams.get(key);
    return raw === null || raw.trim() === "" ? NaN : Number(raw);
  };
  const hourParam = numParam("hour");
  const hour = Number.isFinite(hourParam) && hourParam >= 0 && hourParam <= 23 ? hourParam : new Date().getHours();
  const pickParam = numParam("pick");
  const pick = Number.isFinite(pickParam) && pickParam >= 0 && pickParam < 1 ? pickParam : Math.random();
  const greeting = buildGreeting({ founder, hour, pick });
  return NextResponse.json({ ok: true, founder, ...greeting });
}
