import { NextResponse } from "next/server";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const temp = path.join(root, "temp");
  const probe = path.join(temp, "health-storage-probe.txt");
  try {
    await mkdir(temp, { recursive: true });
    await writeFile(probe, "wobble-storage-ok", "utf8");
    const value = await readFile(probe, "utf8");
    await rm(probe, { force: true });
    return NextResponse.json({ ok: value === "wobble-storage-ok", service: "storage", root });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "storage", error: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
