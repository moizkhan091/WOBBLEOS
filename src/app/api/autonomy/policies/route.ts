import { NextResponse } from "next/server";
import { z } from "zod";
import { createAutonomyPolicy, listAutonomyPolicies } from "@/lib/autonomy";
import { AUTONOMY_LEVELS } from "@/lib/domain/autonomy";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RISK_TIERS = ["low", "medium", "high", "critical"] as const;

const createSchema = z.object({
  category: z.string().trim().min(1),
  grantedLevel: z.enum(AUTONOMY_LEVELS),
  actor: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  maxRiskLevel: z.enum(RISK_TIERS).optional(),
  maxFinancialCents: z.number().int().nonnegative().optional(),
  requiresQaPass: z.boolean().optional(),
  successThreshold: z.number().min(0).max(1).optional(),
  historicalSampleSize: z.number().int().nonnegative().optional(),
  expiresAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** GET /api/autonomy/policies?category=&status= — founder inspection of durable earned-autonomy grants. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  try {
    const policies = await listAutonomyPolicies({ category: url.searchParams.get("category") ?? undefined, status: url.searchParams.get("status") ?? undefined });
    return NextResponse.json({ ok: true, policies });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/autonomy/policies — a founder GRANTS a durable, revocable, versioned autonomy policy for an action category. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const policy = await createAutonomyPolicy({ ...parsed.data, approvedBy: auth });
    return NextResponse.json({ ok: true, policy }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
