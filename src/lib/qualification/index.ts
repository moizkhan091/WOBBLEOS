import { desc, eq, and } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, qualificationAssessments, qualificationRoles } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import {
  QUALIFICATION_ROLES,
  computeQualificationScore,
  gradeFor,
  policySignal,
  blendScore,
  parseRoleResult,
  buildAssessmentRow,
  buildRoleRow,
  type RoleScore,
  type QualificationSubjectSignals,
  type QualificationAssessmentRow,
  type QualificationRoleRow,
} from "@/lib/domain/qualification";

/**
 * Qualification Council service — assesses a prospect (a CRM company) across the 8 council roles. Each role
 * blends a DETERMINISTIC policy signal (from CRM data) with an evidence-LLM score, then a weighted roll-up
 * maps to an A–E grade + recommendation, persisted as a versioned assessment. Provider + store + clock are
 * injectable so the orchestration is unit-tested WITHOUT a live paid call.
 */

export const QUALIFICATION_MODULE = "qualification_council";

export interface QualificationSubject {
  type: "company";
  id: string;
  name: string;
  signals: QualificationSubjectSignals;
  context: string; // human-readable context block for the LLM
}

export interface QualificationStore {
  getCompanySubject(id: string): Promise<QualificationSubject | null>;
  countAssessments(subjectType: string, subjectId: string): Promise<number>;
  insertAssessment(row: QualificationAssessmentRow): Promise<void>;
  insertRoles(rows: QualificationRoleRow[]): Promise<void>;
  listAssessments(subjectType: string, subjectId: string, limit: number): Promise<QualificationAssessmentRow[]>;
  getRoles(assessmentId: string): Promise<QualificationRoleRow[]>;
}

export type RoleProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface QualificationDeps {
  store?: QualificationStore;
  runProvider?: RoleProvider;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  actor?: string;
  model?: string;
}

export interface QualificationResult {
  assessment: QualificationAssessmentRow;
  roles: QualificationRoleRow[];
}

async function audit(deps: QualificationDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

async function scoreRole(subject: QualificationSubject, role: (typeof QUALIFICATION_ROLES)[number], deps: QualificationDeps): Promise<RoleScore> {
  const policy = role.hasPolicySignal ? policySignal(role.slug, subject.signals) : null;
  const runProvider = deps.runProvider ?? (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: role.agentSlug, module: QUALIFICATION_MODULE } }));
  const policyHint = policy ? `\nDeterministic policy signal for this role: ${policy.score}/100 (${policy.note}). Refine around it.` : "";
  const messages: ProviderChatMessage[] = [
    { role: "system", content: "You are a rigorous WOBBLE qualification-council member. Score ONE qualification filter 0-100 (100 = strongly qualified) with a 1-2 sentence rationale grounded in the prospect context. Be skeptical. Respond with STRICT JSON only: {\"score\": <0-100>, \"rationale\": \"...\"}." },
    { role: "user", content: `Prospect: ${subject.name}\n${subject.context}\n\nFilter: ${role.name}\nQuestion: ${role.question}${policyHint}\n\nReturn STRICT JSON only.` },
  ];
  let llmScore: number | null = null;
  let rationale = policy ? `Policy: ${policy.note}` : "no signal";
  try {
    const r = await runProvider({ role: "default", module: QUALIFICATION_MODULE, model: deps.model ?? "openai/gpt-4o-mini", messages, maxTokens: 200, temperature: 0.2 });
    const parsed = parseRoleResult(role.slug, r.text);
    llmScore = parsed.score;
    rationale = parsed.rationale;
  } catch (e) {
    // If the LLM fails, fall back to the deterministic policy score alone (never fabricate a rationale).
    if (!policy) throw e;
    rationale = `LLM unavailable; policy-only. ${policy.note}`;
  }
  return { slug: role.slug, score: blendScore(llmScore, policy), rationale, policyNote: policy?.note };
}

export async function runQualification(subjectId: string, deps: QualificationDeps = {}): Promise<QualificationResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const actor = deps.actor ?? "qualification_council";

  const subject = await store.getCompanySubject(subjectId);
  if (!subject) throw new Error(`company '${subjectId}' not found`);

  const scores: RoleScore[] = [];
  for (const role of QUALIFICATION_ROLES) scores.push(await scoreRole(subject, role, deps));

  const overallScore = computeQualificationScore(scores);
  const { grade, recommendation } = gradeFor(overallScore);
  const version = (await store.countAssessments("company", subjectId)) + 1;
  const weakest = [...scores].sort((a, b) => a.score - b.score)[0];
  const summary = `Grade ${grade} (${overallScore}/100). Weakest filter: ${weakest?.slug} (${weakest?.score}). ${recommendation}`;

  const assessment = buildAssessmentRow({ subjectType: "company", subjectId, version, grade, overallScore, recommendation, summary, model: deps.model ?? "openai/gpt-4o-mini", createdBy: actor }, { now });
  const weightBySlug = QUALIFICATION_ROLES.reduce<Record<string, number>>((acc, r) => ((acc[r.slug] = r.weight), acc), {});
  const agentBySlug = QUALIFICATION_ROLES.reduce<Record<string, string>>((acc, r) => ((acc[r.slug] = r.agentSlug), acc), {});
  const roleRows = scores.map((s) => buildRoleRow({ assessmentId: assessment.id, role: s.slug, agentSlug: agentBySlug[s.slug], score: s.score, weight: weightBySlug[s.slug], rationale: s.rationale, policyNote: s.policyNote ?? null }, { now }));

  await store.insertAssessment(assessment);
  await store.insertRoles(roleRows);
  await audit(deps, { eventType: "qualification.completed", module: QUALIFICATION_MODULE, entityType: "crm_company", entityId: subjectId, actor, metadata: { assessmentId: assessment.id, version, grade, overallScore } });

  return { assessment, roles: roleRows };
}

export async function listQualifications(subjectId: string, limit = 20, deps: QualificationDeps = {}): Promise<QualificationAssessmentRow[]> {
  return (deps.store ?? defaultStore()).listAssessments("company", subjectId, Math.min(Math.max(limit, 1), 100));
}

export async function getQualificationDetail(assessmentId: string, deps: QualificationDeps = {}): Promise<QualificationRoleRow[]> {
  return (deps.store ?? defaultStore()).getRoles(assessmentId);
}

export function defaultStore(db: Db = getDb()): QualificationStore {
  return {
    async getCompanySubject(id) {
      const r = await db.select().from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
      const c = r[0];
      if (!c) return null;
      const context = [
        c.industry ? `Industry: ${c.industry}` : null,
        c.companySize ? `Company size: ${c.companySize}` : null,
        c.country ? `Country: ${c.country}` : null,
        c.status ? `CRM status: ${c.status}` : null,
        c.website ? `Website: ${c.website}` : null,
        c.notes ? `Notes: ${c.notes}` : null,
      ].filter(Boolean).join("\n");
      return {
        type: "company", id: c.id, name: c.name,
        signals: { companySize: c.companySize, industry: c.industry, hasWebsite: Boolean(c.website), hasNotes: Boolean(c.notes), status: c.status },
        context: context || "(no additional context on file)",
      };
    },
    async countAssessments(subjectType, subjectId) {
      const r = await db.select().from(qualificationAssessments).where(and(eq(qualificationAssessments.subjectType, subjectType), eq(qualificationAssessments.subjectId, subjectId)));
      return r.length;
    },
    async insertAssessment(row) { await db.insert(qualificationAssessments).values(row as unknown as typeof qualificationAssessments.$inferInsert); },
    async insertRoles(rows) {
      if (!rows.length) return;
      await db.insert(qualificationRoles).values(rows.map((r) => ({ ...r, weight: String(r.weight) })) as unknown as (typeof qualificationRoles.$inferInsert)[]);
    },
    async listAssessments(subjectType, subjectId, limit) {
      const r = await db.select().from(qualificationAssessments).where(and(eq(qualificationAssessments.subjectType, subjectType), eq(qualificationAssessments.subjectId, subjectId))).orderBy(desc(qualificationAssessments.version)).limit(limit);
      return r as unknown as QualificationAssessmentRow[];
    },
    async getRoles(assessmentId) {
      const r = await db.select().from(qualificationRoles).where(eq(qualificationRoles.assessmentId, assessmentId));
      return r.map((d) => ({ ...d, weight: Number(d.weight) })) as unknown as QualificationRoleRow[];
    },
  };
}
