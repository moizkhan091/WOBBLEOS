import { NextResponse } from "next/server";
import { Client } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ ok: false, service: "web", db: "missing DATABASE_URL" }, { status: 503 });
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("select 1");
    return NextResponse.json({ ok: true, service: "web", db: "connected" });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "web", error: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  } finally {
    await client.end().catch(() => undefined);
  }
}
