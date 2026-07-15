import { NextResponse } from "next/server";
import { z } from "zod";
import { openIncident, actOnIncident, listIncidents, INCIDENT_ACTIONS } from "@/lib/security-governance";
import { FINDING_SEVERITIES } from "@/lib/domain/security-governance";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/security/incidents — the incident log with its full timeline. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  return NextResponse.json({ ok: true, incidents: await listIncidents({ status: url.searchParams.get("status") ?? undefined, limit: 100 }) });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    title: z.string().trim().min(1),
    severity: z.enum(FINDING_SEVERITIES).default("medium"),
    detectionSource: z.string().trim().min(1),
    affectedService: z.string().trim().min(1).optional(),
    clientWorkspaceId: z.string().trim().min(1).optional(),
    detail: z.string().trim().min(1),
    dedupeKey: z.string().trim().min(1).max(200),
  }),
  // Every advance requires a note: the timeline IS the incident record, and a lifecycle step with no
  // detail leaves a post-incident review with nothing to review.
  z.object({ action: z.enum(INCIDENT_ACTIONS), id: z.string().trim().min(1), note: z.string().trim().min(1, "every incident step needs a note — the timeline is the record") }),
]);

/** POST /api/security/incidents — open an incident, or advance one through its lifecycle. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  if (parsed.data.action === "open") {
    const r = await openIncident({ ...parsed.data, openedBy: auth });
    // `created: false` = the same live condition already has an incident. Appending beats spawning
    // thousands of rows for one flapping worker.
    return NextResponse.json({ ok: true, id: r.id, created: r.created }, { status: r.created ? 201 : 200 });
  }
  const r = await actOnIncident({ id: parsed.data.id, action: parsed.data.action, actor: auth, note: parsed.data.note });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, status: r.status });
}
