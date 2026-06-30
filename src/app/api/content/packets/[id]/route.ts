import { NextResponse } from "next/server";
import { getContentPacketDetail } from "@/lib/content";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;
  try {
    const detail = await getContentPacketDetail(id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
