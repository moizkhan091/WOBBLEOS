import { describe, expect, it, vi } from "vitest";
import {
  buildAskContext,
  buildAskAnswer,
  classifyIntent,
  computeConfidence,
  extractDoNotSay,
  type AskBrainRecord,
  type AskMemoryChunk,
  type AskSourceRef,
} from "@/lib/domain/ask";
import { askWobble, type AskWobbleDeps } from "@/lib/ask";
import type { AuditEventInput } from "@/lib/domain/audit";

const brain: AskBrainRecord[] = [
  { slug: "about", title: "About WOBBLE", area: "brand", content: "We build digital employees." },
  { slug: "do-not-say", title: "Do Not Say", area: "do-not-say", content: "No generic AI agency hype." },
];
const memory: AskMemoryChunk[] = [{ id: "mem_1", content: "Teach-first content wins.", trustLevel: "founder_core", tags: ["content"] }];
const sources: AskSourceRef[] = [
  {
    id: "src_1",
    title: "AI OS course",
    sourceType: "transcript",
    trustLevel: "tier_2_approved_expert",
    chunks: [{ id: "sourcechunk_1", content: "AI OS needs context, data, skills, routines, permissions, APIs, and cadence." }],
  },
];

describe("classifyIntent", () => {
  it("classifies content generation, research, decisions, and questions", () => {
    expect(classifyIntent("Write 5 LinkedIn posts about AI agents")).toBe("content_generation");
    expect(classifyIntent("Find sources about AI agents")).toBe("source_search");
    expect(classifyIntent("Research competitor pricing trends")).toBe("research");
    expect(classifyIntent("Should we raise prices next quarter?")).toBe("decision_brief");
    expect(classifyIntent("Send approved post to n8n")).toBe("handoff");
    expect(classifyIntent("Update the brain with this note")).toBe("memory_update");
    expect(classifyIntent("What should WOBBLE focus on this week?")).toBe("question");
  });
});

describe("buildAskContext", () => {
  it("grounds on Brain + approved evidence, builds citations, includes do-not-say + gap rule", () => {
    const ctx = buildAskContext({ question: "What should we post?", brain, memory, sources, doNotSay: extractDoNotSay(brain) });
    expect(ctx.evidenceCount).toBe(2);
    expect(ctx.hasHighTrust).toBe(true);
    expect(ctx.citations.map((c) => c.kind)).toEqual(["memory", "source"]);
    expect(ctx.systemPrompt).toContain("Do-not-say rules");
    expect(ctx.systemPrompt).toContain("insufficient");
  });

  it("includes approved source chunk text in the evidence prompt, not only source titles", () => {
    const ctx = buildAskContext({
      question: "What did the AI OS course teach us?",
      brain,
      memory: [],
      sources: [
        {
          ...sources[0],
          chunks: [
            {
              id: "sourcechunk_1",
              content: "A serious AI OS is built from context, data, skills, routines, permissions, APIs, and cadence.",
            },
          ],
        },
      ],
    });

    expect(ctx.systemPrompt).toContain("A serious AI OS is built from context, data, skills, routines, permissions, APIs, and cadence.");
  });

  it("caps input cost: bounds Brain items, per-item length, evidence, and snapshot", () => {
    const bigBrain: AskBrainRecord[] = Array.from({ length: 100 }, (_, i) => ({
      slug: `b${i}`,
      title: `Rec ${i}`,
      area: "brand",
      content: "X".repeat(5000),
    }));
    const ctx = buildAskContext({
      question: "q",
      brain: bigBrain,
      memory: [],
      sources: [],
      systemSnapshot: "S".repeat(20000),
      budget: { maxBrainItems: 5, maxBrainCharsPerItem: 100, maxEvidenceChars: 500, maxSnapshotChars: 300 },
    });

    // Only 5 brain records survive, each capped at ~100 chars.
    expect((ctx.systemPrompt.match(/- Rec \d+ \(brand\)/g) ?? []).length).toBe(5);
    expect(ctx.systemPrompt).toContain("Rec 0");
    expect(ctx.systemPrompt).not.toContain("Rec 6");
    // Snapshot is truncated well below its 20k raw length.
    const snapMatch = ctx.systemPrompt.match(/S{50,}/);
    expect(snapMatch && snapMatch[0].length).toBeLessThanOrEqual(300);
    // Sanity: total prompt is a small multiple of the budget, not the 500k+ raw input.
    expect(ctx.systemPrompt.length).toBeLessThan(4000);
  });

  it("truncating the evidence block preserves its newline structure (citations stay on separate lines)", () => {
    const manyChunks: AskSourceRef[] = [
      {
        id: "src_big",
        title: "Big source",
        sourceType: "transcript",
        trustLevel: "tier_2_approved_expert",
        chunks: Array.from({ length: 30 }, (_, i) => ({ id: `sc_${i}`, content: `Chunk ${i} ${"y".repeat(1000)}` })),
      },
    ];
    const ctx = buildAskContext({ question: "q", brain: [], memory: [], sources: manyChunks, budget: { maxBrainItems: 24, maxBrainCharsPerItem: 700, maxEvidenceChars: 800, maxSnapshotChars: 4000 } });
    // Evidence is capped but still multi-line (newlines preserved, not flattened into one line).
    const evidenceStart = ctx.systemPrompt.indexOf("Approved evidence");
    const evidenceRegion = ctx.systemPrompt.slice(evidenceStart);
    expect(evidenceRegion).toContain("\n");
    expect(evidenceRegion).toContain("…");
  });
});

describe("computeConfidence", () => {
  it("scales with evidence and trust", () => {
    expect(computeConfidence(0, false)).toBe("low");
    expect(computeConfidence(2, true)).toBe("medium");
    expect(computeConfidence(3, true)).toBe("high");
  });
});

describe("buildAskAnswer", () => {
  it("flags founder judgment when evidence is thin", () => {
    const ctx = buildAskContext({ question: "x", brain, memory: [], sources: [] });
    const ans = buildAskAnswer("text", ctx, "modelrun_1");
    expect(ans.needsFounderJudgment.length).toBeGreaterThan(0);
    expect(ans.confidence).toBe("low");
    expect(ans.modelRunId).toBe("modelrun_1");
  });
});

function deps(overrides: Partial<AskWobbleDeps> = {}): AskWobbleDeps {
  return {
    retrieveBrain: async () => brain,
    retrieveMemory: async () => memory,
    retrieveSources: async () => sources,
    // Stub the live system snapshot (WOB-AUD-006): without this, when a real DATABASE_URL is present the
    // default `retrieveSystemSnapshot` pulls SEEDED system data into the evidence, which flips the
    // thin-evidence assertion and made `release:check`/`release:full` fail non-deterministically. A unit
    // test must not depend on ambient DB state.
    retrieveSystemSnapshot: async () => undefined,
    retrieveIntelligence: async () => ({ block: "", itemIds: [] as string[], insightIds: [] as string[], gaps: [] as string[], hasIntelligence: false }),
    runProvider: async () => ({ text: "Here is the answer [1].", run: { id: "modelrun_1" } }),
    recordAudit: async () => {},
    ...overrides,
  };
}

describe("askWobble - question intent", () => {
  it("answers from approved material, cites, and logs audit", async () => {
    const audit: AuditEventInput[] = [];
    const result = await askWobble({ question: "What is our content strategy?", founder: "Moiz" }, deps({ recordAudit: async (i) => { audit.push(i); } }));
    expect(result.type).toBe("answer");
    if (result.type !== "answer") throw new Error("expected answer");
    expect(result.answer.answer).toBe("Here is the answer [1].");
    expect(result.answer.citations).toHaveLength(2);
    expect(result.answer.modelRunId).toBe("modelrun_1");
    expect(audit.some((a) => a.eventType === "ask.answered")).toBe(true);
  });

  it("sends approved source chunk evidence into the provider prompt", async () => {
    const runProvider = vi.fn<NonNullable<AskWobbleDeps["runProvider"]>>(async () => ({
      text: "Here is the answer [2].",
      run: { id: "modelrun_1" },
    }));
    await askWobble({ question: "What did the course teach us?" }, deps({ runProvider }));

    expect(runProvider).toHaveBeenCalledTimes(1);
    const providerInput = runProvider.mock.calls[0]?.[0];
    expect(providerInput?.maxTokens).toBe(500);
    expect(providerInput?.messages[0]?.content).toContain("AI OS needs context, data, skills, routines, permissions, APIs, and cadence.");
  });

  it("allows a bounded maxTokens override for controlled live spend", async () => {
    const runProvider = vi.fn<NonNullable<AskWobbleDeps["runProvider"]>>(async () => ({
      text: "Short answer.",
      run: { id: "modelrun_1" },
    }));
    await askWobble({ question: "Summarize WOBBLE", maxTokens: 180 }, deps({ runProvider }));

    expect(runProvider.mock.calls[0]?.[0].maxTokens).toBe(180);
    await expect(askWobble({ question: "Summarize WOBBLE", maxTokens: 5000 }, deps({ runProvider }))).rejects.toThrowError();
  });

  it("STILL calls the model when evidence is thin (to explain the gap), marking insufficiency", async () => {
    const runProvider = vi.fn(async () => ({ text: "Not enough approved sources yet; add X.", run: { id: "modelrun_2" } }));
    const result = await askWobble(
      { question: "What is our content strategy?" },
      deps({ retrieveBrain: async () => [], retrieveMemory: async () => [], retrieveSources: async () => [], runProvider }),
    );
    expect(runProvider).toHaveBeenCalledTimes(1); // model IS called to explain the gap
    if (result.type !== "answer") throw new Error("expected answer");
    expect(result.answer.hasSufficientEvidence).toBe(false);
    expect(result.answer.confidence).toBe("low");
  });
});

describe("askWobble - router", () => {
  it("returns a PLANNED route (no fake job) for unbuilt modules", async () => {
    const enqueueJob = vi.fn();
    const result = await askWobble(
      { question: "Research competitor pricing trends" },
      deps({ enqueueJob: enqueueJob as never }),
    );
    expect(result.type).toBe("route");
    if (result.type !== "route") throw new Error("expected route");
    expect(result.intent).toBe("research");
    expect(result.status).toBe("planned");
    expect(result.jobId).toBeUndefined();
    expect(enqueueJob).not.toHaveBeenCalled(); // never enqueue when module is planned
  });

  it("routes content generation to the real content worker job by default", async () => {
    const enqueueJob = vi.fn(async () => ({ job: { id: "job_99" } }));
    const result = await askWobble(
      { question: "Write a LinkedIn post about AI agents", founder: "Moiz" },
      deps({ enqueueJob }),
    );
    if (result.type !== "route") throw new Error("expected route");
    expect(result.status).toBe("available");
    expect(result.jobId).toBe("job_99");
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "general",
        type: "content.generate",
        payload: {
          contentTrackId: "track_wobble_company",
          requestedBy: "Moiz",
          objective: "Write a LinkedIn post about AI agents",
        },
      }),
    );
  });

  it("rejects an empty question", async () => {
    await expect(askWobble({ question: "  " }, deps())).rejects.toThrowError();
  });

  it("surfaces the CAPABILITY ROUTER decision — content generation → the content department (one dept, not a fan-out)", async () => {
    const enqueueJob = vi.fn(async () => ({ job: { id: "job_cr" } }));
    const loadDepartmentCapabilities = async () => [
      { slug: "content", status: "active", operatingModel: "agent_team", inboundCapabilities: ["generate_content_pack"], permittedDataClassifications: ["internal", "client_confidential"] },
      { slug: "research_intelligence", status: "active", operatingModel: "agent_team", inboundCapabilities: ["scout"], permittedDataClassifications: ["internal"] },
    ];
    const result = await askWobble(
      { question: "Write a LinkedIn post about AI agents", founder: "Moiz" },
      deps({ enqueueJob, loadDepartmentCapabilities } as never),
    );
    if (result.type !== "route") throw new Error("expected route");
    expect(result.capabilityRoute?.department).toBe("content");
    expect(result.capabilityRoute?.confidence).toBe("high");
    expect(result.capabilityRoute?.cost).toBe("medium");
    expect(result.capabilityRoute?.alternatives).toEqual([]); // one department, never fanned out
  });

  it("the capability route DEGRADES gracefully (job still routes) if the registry can't load", async () => {
    const enqueueJob = vi.fn(async () => ({ job: { id: "job_deg" } }));
    const loadDepartmentCapabilities = async () => { throw new Error("no registry"); };
    const result = await askWobble(
      { question: "Write a LinkedIn post about AI agents", founder: "Moiz" },
      deps({ enqueueJob, loadDepartmentCapabilities } as never),
    );
    if (result.type !== "route") throw new Error("expected route");
    expect(result.status).toBe("available");
    expect(result.jobId).toBe("job_deg"); // the command still ran
    expect(result.capabilityRoute).toBeUndefined();
  });
});
