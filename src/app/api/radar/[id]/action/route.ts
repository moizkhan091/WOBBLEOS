import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRadarScan, setRadarStatus } from "@/lib/radar";
import { RADAR_STATUSES } from "@/lib/domain/radar";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("status"), status: z.enum(RADAR_STATUSES) }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const scan = parsed.data.action === "generate" ? await generateRadarScan(id, { actor: auth }) : await setRadarStatus(id, parsed.data.status, { actor: auth });
    if (!scan) return NextResponse.json({ ok: false, error: "scan not found" }, { status: 404 });
    return NextResponse.json({ ok: true, scan });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
