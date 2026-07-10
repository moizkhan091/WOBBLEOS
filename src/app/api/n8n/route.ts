import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { webhookEndpoints, webhookEvents } from "@/db/schema";
import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/n8n — the handoff bridge: registered webhook endpoints + recent signed events. */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const db = getDb();
    const [endpoints, events] = await Promise.all([
      db.select().from(webhookEndpoints).limit(50),
      db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(50),
    ]);
    const configured = Boolean((process.env.N8N_WEBHOOK_SECRET ?? "").trim());
    return NextResponse.json({
      ok: true,
      configured,
      endpoints: endpoints.map((e) => ({ id: e.id, url: e.url, secretRefName: e.secretRefName, enabled: e.enabled })),
      events: events.map((ev) => ({ id: ev.id, direction: ev.direction, eventType: ev.eventType, status: ev.status, signatureVerified: ev.signatureVerified, replayProtected: ev.replayProtected, createdAt: ev.createdAt })),
      counts: {
        endpoints: endpoints.length,
        events: events.length,
        verified: events.filter((e) => e.signatureVerified).length,
        failed: events.filter((e) => e.status !== "ok" && e.status !== "delivered" && e.status !== "received").length,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
