import { NextResponse } from "next/server";
import { z } from "zod";
import { createMemoryRecord, listMemoryRecords } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const MEMORY_TIERS = ["core", "working", "episodic"] as const;
const TRUST_LEVELS = ["founder_core", "approved_expert", "monitored", "experimental", "blocked"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  area: z.string().trim().min(1),
  memoryTier: z.enum(MEMORY_TIERS).default("working"),
  trustLevel: z.enum(TRUST_LEVELS).default("approved_expert"),
  bankSlugs: z.array(z.string().trim().min(1)).min(1),
  createdBy: z.string().trim().min(1).optional(), // ignored — the acting founder comes from the session
  confidence: z.number().min(0).max(1).optional(),
});

function errorStatus(message: string): number {
  if (/personal memory bank/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/unknown or inactive memory bank/i.test(message)) return 422;
  return 500;
}

/**
 * GET /api/memory/records?bank=founder_moiz&status=active — browse a bank's records in detail.
 *
 * Any authenticated founder may browse any bank, including a colleague's — founder memory is
 * transparent across the company, and this endpoint backs the founder-profile surface. There is
 * deliberately no owner check on READ; editing stays owner-only via the POST below.
 *
 * `requireFounder` closes WOB-UAT-029: the edge proxy is JWT-signature-only, so without this gate a
 * REVOKED session still read every bank until its token expired.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const bankSlug = url.searchParams.get("bank") ?? undefined;
  const status = (url.searchParams.get("status") as "active" | "archived" | null) ?? "active";
  const area = url.searchParams.get("area") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 100);
  try {
    const records = await listMemoryRecords({ bankSlug, status: status ?? undefined, area, limit });
    return NextResponse.json({ ok: true, records });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/memory/records — founder adds a memory directly (permission-checked + audited). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const record = await createMemoryRecord({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
