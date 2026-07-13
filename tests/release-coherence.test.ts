import { describe, expect, it } from "vitest";
import { CANONICAL_DEPARTMENTS } from "@/lib/departments/seed";
import { DEFAULT_AGENTS } from "@/lib/domain/agents";

/**
 * RELEASE COHERENCE (Phase 11 gate) — asserts the whole system is wired correctly, so a mis-wire (a missing
 * orchestrator, a dangling consumer, an unregistered QA reviewer) fails CI instead of shipping. This is the
 * "is it actually complete + reachable" guard that runs on every push.
 */
const agentBySlug = new Map(DEFAULT_AGENTS.map((a) => [a.slug, a]));
const deptBySlug = new Map(CANONICAL_DEPARTMENTS.map((d) => [d.slug, d]));
const activeDepts = CANONICAL_DEPARTMENTS.filter((d) => d.status === "active");
const effectiveStatus = (a: { status?: string }): string => a.status ?? "active";

describe("release coherence — departments", () => {
  it("every ACTIVE department has a registered, non-paused orchestrator (except the human-operated hub)", () => {
    const bad: string[] = [];
    for (const d of activeDepts) {
      if (d.slug === "founder_command_centre") continue; // human-operated, no LLM orchestrator by design
      const slug = d.orchestratorAgentSlug;
      const agent = slug ? agentBySlug.get(slug) : undefined;
      if (!agent) bad.push(`${d.slug}: orchestrator '${slug}' not registered`);
      else if (effectiveStatus(agent) === "paused") bad.push(`${d.slug}: orchestrator '${slug}' is paused`);
    }
    expect(bad, `active departments with a missing/paused orchestrator: ${bad.join("; ")}`).toEqual([]);
  });

  it("every department's downstreamConsumers reference a REAL department (no dangling routes)", () => {
    const bad: string[] = [];
    for (const d of CANONICAL_DEPARTMENTS) {
      for (const consumer of d.io?.downstreamConsumers ?? []) {
        if (!deptBySlug.has(consumer)) bad.push(`${d.slug} → '${consumer}' (no such department)`);
      }
    }
    expect(bad, `dangling downstream routes: ${bad.join("; ")}`).toEqual([]);
  });

  it("a self-triggering department accepts its OWN primary product schema (guards the research-schema regression)", () => {
    // Departments whose vertical builds a self-inbound envelope with expectedOutputSchema = their own product.
    const selfTriggers: Record<string, string> = { research_intelligence: "validated_intelligence" };
    const bad: string[] = [];
    for (const [slug, schema] of Object.entries(selfTriggers)) {
      const d = deptBySlug.get(slug);
      if (!d?.io?.acceptedHandoffSchemas?.includes(schema)) bad.push(`${slug} must accept its own '${schema}' inbound`);
    }
    expect(bad, bad.join("; ")).toEqual([]);
  });
});

describe("release coherence — QA reviewers", () => {
  it("every implemented QA board's reviewer identity is a registered, non-paused agent", () => {
    const reviewers = ["paid_audit_qa_reviewer", "content_quality_reviewer", "content_brand_reviewer", "proposal_technical_reviewer", "proposal_commercial_reviewer", "research_validation_reviewer"];
    const bad: string[] = [];
    for (const slug of reviewers) {
      const a = agentBySlug.get(slug);
      if (!a) bad.push(`${slug}: not registered`);
      else if (effectiveStatus(a) === "paused") bad.push(`${slug}: paused`);
    }
    expect(bad, bad.join("; ")).toEqual([]);
  });
});
