import { describe, expect, it, vi } from "vitest";
import {
  buildAskContext,
  buildAskAnswer,
  classifyIntent,
  computeConfidence,
  extractDoNotSay,
  DEFAULT_CAPABILITIES,
  type AskBrainRecord,
  type AskMemoryChunk,
  type AskSourceRef,
  type CapabilityRoute,
  type IntentType,
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
    expect(providerInput?.messages[0]?.content).toContain("AI OS needs context, data, skills, routines, permissions, APIs, and cadence.");
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
      { question: "Write a LinkedIn post about AI agents" },
      deps({ enqueueJob: enqueueJob as never }),
    );
    expect(result.type).toBe("route");
    if (result.type !== "route") throw new Error("expected route");
    expect(result.intent).toBe("content_generation");
    expect(result.status).toBe("planned");
    expect(result.jobId).toBeUndefined();
    expect(enqueueJob).not.toHaveBeenCalled(); // never enqueue when module is planned
  });

  it("routes to a real job when the capability is marked available", async () => {
    const available: Record<IntentType, CapabilityRoute> = {
      ...DEFAULT_CAPABILITIES,
      content_generation: { intent: "content_generation", module: "content_command", queue: "content", jobType: "content.generate", status: "available" },
    };
    const enqueueJob = vi.fn(async () => ({ job: { id: "job_99" } }));
    const result = await askWobble(
      { question: "Write a LinkedIn post about AI agents" },
      deps({ capabilities: available, enqueueJob }),
    );
    if (result.type !== "route") throw new Error("expected route");
    expect(result.status).toBe("available");
    expect(result.jobId).toBe("job_99");
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty question", async () => {
    await expect(askWobble({ question: "  " }, deps())).rejects.toThrowError();
  });
});
