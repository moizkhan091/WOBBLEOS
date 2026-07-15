import { NextResponse } from "next/server";
import { publisherAvailability } from "@/lib/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/library/publishers — the truthful state of every publishing method (WOB-UAT-006).
 *
 * The single source of truth for what the founder may select. It is DERIVED from the live registry +
 * env, never a hand-maintained list: three such lists (the Zod enum, the registry, the UI dropdown) had
 * drifted apart, which is how `ayrshare`/`n8n` came to be offered, accepted with a 201, and then
 * silently dropped forever.
 *
 * Every entry is exactly one of:
 *   operational — connected; WOBBLE publishes automatically at the scheduled time
 *   manual      — a legitimate operating model: WOBBLE prepares, a human posts and marks it done
 *   blocked     — known adapter, credentials absent; NOT selectable, and it says why
 * A publisher with no adapter is not returned at all, so it cannot be offered.
 */
export async function GET(request: Request) {
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const publishers = publisherAvailability();
  return NextResponse.json({ ok: true, publishers, selectable: publishers.filter((p) => p.state !== "blocked").map((p) => p.publisher) });
}
