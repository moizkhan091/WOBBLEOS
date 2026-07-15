import { NextResponse } from "next/server";
import { retrieveTrustedContext, contextCoverageForScope, listContextContradictions } from "@/lib/context-os";
import { CONTEXT_SCOPES, type ContextScopeType } from "@/lib/domain/context-os";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/context?scope=&id=&task= — the founder-facing trusted context for a scope: the approved assertions
 *  (records a retrieval evidence row), plus coverage + open contradictions. Only APPROVED, in-scope facts. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const u = new URL(request.url);
  const type = u.searchParams.get("scope") as ContextScopeType | null;
  const scopeId = u.searchParams.get("id");
  if (!type || !CONTEXT_SCOPES.includes(type) || !scopeId) return NextResponse.json({ ok: false, error: "scope (type) + id are required" }, { status: 422 });
  const scope = { type, id: scopeId };
  try {
    const [{ assertions, retrievalId }, coverage, contradictions] = await Promise.all([
      retrieveTrustedContext(scope, u.searchParams.get("task") ?? "ask", { agentSlug: u.searchParams.get("agent") ?? undefined }),
      contextCoverageForScope(scope),
      listContextContradictions(scope),
    ]);
    return NextResponse.json({ ok: true, scope, assertions, coverage, contradictions, retrievalId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
