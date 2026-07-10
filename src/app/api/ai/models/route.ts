import { NextResponse } from "next/server";
import { CHAT_MODELS } from "@/lib/ai-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/models — the models the chat picker may select (kept in sync with the server allowlist). */
export async function GET() {
  return NextResponse.json({ ok: true, models: CHAT_MODELS });
}
