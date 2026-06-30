import { NextResponse } from "next/server";
import { z } from "zod";
import { createContentPacket, listContentPackets } from "@/lib/content";
import {
  CONTENT_APPROVAL_STATUSES,
  CONTENT_FORMATS,
  CONTENT_PLATFORMS,
  CONTENT_QUALITY_STATUSES,
  createContentPacketSchema,
} from "@/lib/domain/content-command";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const apiCreateContentPacketSchema = createContentPacketSchema.extend({
  requestApproval: z.boolean().default(false),
});

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const approvalStatus = searchParams.get("approvalStatus");
  const qualityStatus = searchParams.get("qualityStatus");
  const platform = searchParams.get("platform");
  const format = searchParams.get("format");

  try {
    const packets = await listContentPackets({
      contentTrackId: searchParams.get("contentTrackId") ?? undefined,
      approvalStatus: CONTENT_APPROVAL_STATUSES.includes(approvalStatus as never) ? (approvalStatus as never) : undefined,
      qualityStatus: CONTENT_QUALITY_STATUSES.includes(qualityStatus as never) ? (qualityStatus as never) : undefined,
      platform: CONTENT_PLATFORMS.includes(platform as never) ? (platform as never) : undefined,
      format: CONTENT_FORMATS.includes(format as never) ? (format as never) : undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: packets.length, packets });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = apiCreateContentPacketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await createContentPacket(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") || message.includes("not active") ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
