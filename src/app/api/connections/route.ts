import { NextResponse } from "next/server";
import { z } from "zod";
import { listConnections, registerConnection } from "@/lib/connections";
import { registerConnectionSchema } from "@/lib/domain/connections";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

function parseEnabled(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/** GET /api/connections - list external API/tool connections without secrets. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { searchParams } = new URL(request.url);
  try {
    const connections = await listConnections({
      providerType: searchParams.get("providerType") ?? undefined,
      enabled: parseEnabled(searchParams.get("enabled")),
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json({ ok: true, count: connections.length, connections });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/connections - register a provider/tool connection. Secrets stay in env only. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = registerConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: z.treeifyError(parsed.error) }, { status: 422 });
  }

  try {
    const connection = await registerConnection(parsed.data);
    return NextResponse.json({ ok: true, connection }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
