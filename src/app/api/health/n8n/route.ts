import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.N8N_WEBHOOK_SECRET && process.env.N8N_WEBHOOK_SECRET !== "change-me");
  return NextResponse.json({
    ok: configured,
    service: "n8n",
    mode: "configuration-check-only",
    outboundActionsTriggered: false,
  }, { status: configured ? 200 : 503 });
}
