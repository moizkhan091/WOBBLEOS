import { NextResponse } from "next/server";
import { CHAT_MODELS } from "@/lib/ai-chat";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/models — the models the chat picker may select (kept in sync with the server allowlist). */
export async function GET(request: Request) {
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ ok: true, models: CHAT_MODELS });
}
