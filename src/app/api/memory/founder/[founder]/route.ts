import { NextResponse } from "next/server";
import { getFounderMemory } from "@/lib/memory";

export const dynamic = "force-dynamic";

/** GET /api/memory/founder/[founder] — "what WOBBLE knows about me": a founder's personal memory. */
export async function GET(_request: Request, { params }: { params: Promise<{ founder: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { founder } = await params;
  try {
    const memory = await getFounderMemory(founder);
    return NextResponse.json({ ok: true, ...memory });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
