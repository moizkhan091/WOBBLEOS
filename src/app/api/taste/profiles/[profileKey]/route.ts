import { NextResponse } from "next/server";
import { getTasteProfile, listFeedbackEvents } from "@/lib/taste";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(_request: Request, context: { params: Promise<{ profileKey: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { profileKey } = await context.params;
  const decoded = decodeURIComponent(profileKey);
  const profile = await getTasteProfile(decoded);
  if (!profile) return NextResponse.json({ ok: false, error: "taste profile not found" }, { status: 404 });
  const feedback = await listFeedbackEvents({ profileKey: decoded, limit: 50 });
  return NextResponse.json({ ok: true, profile, feedback });
}
