import { NextResponse } from "next/server";
import { chatModelChoices } from "@/lib/ai-chat";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/models — the models the chat picker may select.
 *
 * Derived from the same catalog and role map the Model Control page edits, so a founder who switches
 * models there sees the switch here on the next load, and the price of each option is on the option.
 */
export async function GET(request: Request) {
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, models: await chatModelChoices() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
