import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleAutomation, runAutomation } from "@/lib/automations";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }),
  z.object({ action: z.literal("run"), extraPayload: z.record(z.string(), z.unknown()).optional() }),
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
    if (parsed.data.action === "toggle") {
      const rule = await toggleAutomation(id, parsed.data.enabled, { actor: auth });
      if (!rule) return NextResponse.json({ ok: false, error: "rule not found" }, { status: 404 });
      return NextResponse.json({ ok: true, rule });
    }
    const result = await runAutomation(id, { actor: auth, extraPayload: parsed.data.extraPayload }, {});
    if (!result) return NextResponse.json({ ok: false, error: "rule not found" }, { status: 404 });
    return NextResponse.json({ ok: true, rule: result.rule, jobId: result.jobId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
