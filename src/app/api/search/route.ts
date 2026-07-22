import { NextResponse } from "next/server";
import { and, desc, ilike, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { audits, contentPackets, crmCompanies, crmLeads, crmOpportunities, proposals } from "@/db/schema";
import { isAuthError, requireFounder } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q= — the record half of the command palette (Cmd+K).
 *
 * The palette matches MODULES locally (see `matchModules` in `@/lib/os/modules`) and only comes here
 * for the things that live in the database. One request, one round of parallel queries, capped hard —
 * this runs on every keystroke-after-debounce, so it must never become an expensive endpoint.
 *
 * Founder-gated like every other read (WOB-UAT-029): search returns real pipeline, deal and client
 * names, which is exactly the kind of business data a revoked session must not be able to enumerate.
 */

export interface SearchResult {
  kind: string;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

/** Per-kind cap. Six is enough to recognise "yes, that one" without the palette becoming a list view. */
const PER_KIND = 6;
/** Total cap across every kind. Belt-and-braces: 6 kinds x 6 = 36 today, but adding a kind must not grow the payload. */
const TOTAL_CAP = 30;
/** Below this the query is too broad to be useful and we refuse to touch the DB at all. */
const MIN_QUERY = 2;

/**
 * Escape the LIKE metacharacters before wrapping the query in `%…%`.
 *
 * WHY: `ilike` binds the pattern as a parameter, so this is not an injection risk — but an UNESCAPED
 * `%` still means "match anything". A founder typing `%` (or `_`, common in ids like `paid_audit`)
 * would otherwise get every row in six tables back, and `_` would silently match any character rather
 * than the underscore they typed. Postgres' default LIKE escape character is the backslash, so the
 * backslash itself has to be escaped first.
 */
function likePattern(raw: string): string {
  return `%${raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

export async function GET(request: Request) {
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.trim();
  // Short-circuit BEFORE the DATABASE_URL check and before any query: an empty palette is the normal
  // resting state, not an error, and it must not cost a connection.
  if (q.length < MIN_QUERY) return NextResponse.json({ ok: true, results: [] });

  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const pattern = likePattern(q);
  const db = getDb();

  try {
    // ONE round. Six independent index-free ILIKE scans in parallel beat six sequential awaits, and
    // the palette's perceived latency is the slowest query, not their sum.
    const [companies, opportunities, leads, proposalRows, auditRows, packets] = await Promise.all([
      db.select({ id: crmCompanies.id, name: crmCompanies.name, status: crmCompanies.status, industry: crmCompanies.industry })
        .from(crmCompanies)
        .where(and(ilike(crmCompanies.name, pattern), isNull(crmCompanies.archivedAt)))
        .orderBy(desc(crmCompanies.createdAt))
        .limit(PER_KIND),
      db.select({ id: crmOpportunities.id, name: crmOpportunities.name, stage: crmOpportunities.stage, status: crmOpportunities.status })
        .from(crmOpportunities)
        .where(and(ilike(crmOpportunities.name, pattern), isNull(crmOpportunities.archivedAt)))
        .orderBy(desc(crmOpportunities.createdAt))
        .limit(PER_KIND),
      db.select({ id: crmLeads.id, name: crmLeads.name, status: crmLeads.status, source: crmLeads.source })
        .from(crmLeads)
        .where(and(ilike(crmLeads.name, pattern), isNull(crmLeads.archivedAt)))
        .orderBy(desc(crmLeads.createdAt))
        .limit(PER_KIND),
      db.select({ id: proposals.id, title: proposals.title, status: proposals.status })
        .from(proposals)
        .where(and(ilike(proposals.title, pattern), isNull(proposals.archivedAt)))
        .orderBy(desc(proposals.createdAt))
        .limit(PER_KIND),
      // audits + content_packets have no archivedAt column — nothing to exclude.
      db.select({ id: audits.id, businessName: audits.businessName, kind: audits.kind, status: audits.status })
        .from(audits)
        .where(ilike(audits.businessName, pattern))
        .orderBy(desc(audits.createdAt))
        .limit(PER_KIND),
      db.select({ id: contentPackets.id, hook: contentPackets.hook, platform: contentPackets.platform, format: contentPackets.format })
        .from(contentPackets)
        .where(ilike(contentPackets.hook, pattern))
        .orderBy(desc(contentPackets.createdAt))
        .limit(PER_KIND),
    ]);

    const results: SearchResult[] = [
      ...companies.map((r) => ({ kind: "company", id: r.id, label: r.name, sublabel: [r.status, r.industry].filter(Boolean).join(" · ") || undefined, href: "/crm" })),
      ...opportunities.map((r) => ({ kind: "deal", id: r.id, label: r.name, sublabel: [r.stage, r.status].filter(Boolean).join(" · ") || undefined, href: "/crm" })),
      ...leads.map((r) => ({ kind: "lead", id: r.id, label: r.name, sublabel: [r.status, r.source].filter(Boolean).join(" · ") || undefined, href: "/crm" })),
      ...proposalRows.map((r) => ({ kind: "proposal", id: r.id, label: r.title, sublabel: r.status || undefined, href: "/docs" })),
      // A paid audit is not on the Quick Pitch page, so sending a founder to /free_audit for one would
      // be a dead end — the row they clicked would not be there. Route by the audit's own kind.
      ...auditRows.map((r) => ({ kind: "audit", id: r.id, label: r.businessName, sublabel: [r.kind === "paid" ? "paid audit" : "free audit", r.status].filter(Boolean).join(" · "), href: r.kind === "paid" ? "/paid_audit" : "/free_audit" })),
      ...packets.map((r) => ({ kind: "content", id: r.id, label: r.hook ?? "(no hook yet)", sublabel: [r.platform, r.format].filter(Boolean).join(" · ") || undefined, href: "/content" })),
    ].slice(0, TOTAL_CAP);

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
