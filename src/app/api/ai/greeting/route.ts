import { NextResponse } from "next/server";
import { getActingFounder } from "@/lib/auth";
import { buildGreeting } from "@/lib/domain/greeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/greeting?hour=&pick= — personality greeting for the logged-in founder. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const founder = await getActingFounder(request).catch(() => null);
  const hourParam = Number(u.searchParams.get("hour"));
  const hour = Number.isFinite(hourParam) && hourParam >= 0 && hourParam <= 23 ? hourParam : new Date().getHours();
  const pickParam = Number(u.searchParams.get("pick"));
  const pick = Number.isFinite(pickParam) && pickParam >= 0 && pickParam < 1 ? pickParam : Math.random();
  const greeting = buildGreeting({ founder, hour, pick });
  return NextResponse.json({ ok: true, founder, ...greeting });
}
