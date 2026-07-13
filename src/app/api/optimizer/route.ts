import { NextResponse } from "next/server";
import { runOptimizerCycle, listCycles, listProposals } from "@/lib/optimizer";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/optimizer — founder view of optimizer cycles + improvement proposals. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  try {
    const [cycles, proposals] = await Promise.all([
      listCycles(Number(searchParams.get("limit") ?? 50)),
      listProposals({ status: searchParams.get("status") ?? undefined, cycleId: searchParams.get("cycleId") ?? undefined }),
    ]);
    return NextResponse.json({ ok: true, cycles, proposals });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/optimizer — a founder manually TRIGGERS an optimizer cycle (the scheduler runs it automatically too).
 * A cycle only OBSERVES real signals + PROPOSES opportunities; it never approves, activates, or changes anything.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const result = await runOptimizerCycle({ trigger: "manual" });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
