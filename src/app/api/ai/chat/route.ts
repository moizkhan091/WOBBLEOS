import { NextResponse } from "next/server";
import { chatWithWobble, chatSchema } from "@/lib/ai-chat";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ai/chat — universal WOBBLE chat with file attachments (images/PDFs/text). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = chatSchema.omit({ founder: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  if (!parsed.data.message.trim() && !(parsed.data.attachments?.length)) return NextResponse.json({ ok: false, error: "a message or at least one attachment is required" }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const result = await chatWithWobble({ ...parsed.data, founder: auth });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
