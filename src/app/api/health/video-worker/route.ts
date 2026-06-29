import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const heartbeatPath = path.join(root, "temp", "video-worker-heartbeat.json");
  try {
    const raw = await readFile(heartbeatPath, "utf8");
    return NextResponse.json({ ok: true, service: "video-worker", heartbeat: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ ok: false, service: "video-worker", heartbeat: "missing" }, { status: 503 });
  }
}
