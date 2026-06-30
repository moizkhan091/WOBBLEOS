import { describe, expect, it, vi } from "vitest";
import { buildContentTrackRow, type CreateContentPacketInput } from "@/lib/domain/content-command";
import {
  CONTENT_GENERATE_JOB_TYPE,
  buildContentGenerationPrompt,
  parseContentWorkerModelOutput,
} from "@/lib/domain/content-worker";
import {
  enqueueContentGenerationJob,
  runContentGenerationJob,
  type ContentGenerationDeps,
} from "@/lib/content-worker";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-30T09:00:00.000Z");

const track = buildContentTrackRow(
  {
    slug: "wobble_company",
    label: "WOBBLE Company",
    ownerType: "company",
    voiceProfile: { tone: "teach-first, sharp, premium, rebellious" },
    goals: ["AI OS education", "WOBBLE authority"],
    allowedTopics: ["AI operating systems", "AI employees"],
    bannedPhrases: ["generic AI agency"],
    aggressionRange: { min: 2, max: 8 },
    platformPriorities: ["linkedin", "instagram", "x"],
    approvalRequired: true,
  },
  { id: "track_wobble_company", now },
);

const founderTrack = buildContentTrackRow(
  {
    slug: "moiz_founder_pov",
    label: "Moiz Founder POV",
    ownerType: "founder",
    voiceProfile: {
      founderName: "Moiz",
      tone: "founder-led, direct, educational, operator POV",
      signatureBeliefs: ["teach what we are building", "show the OS not the agency package"],
    },
    goals: ["founder authority", "education"],
    allowedTopics: ["AI OS builds", "agency dependency"],
    bannedPhrases: ["easy money"],
    aggressionRange: { min: 3, max: 9 },
    platformPriorities: ["linkedin", "x", "instagram"],
    approvalRequired: true,
  },
  { id: "track_moiz_founder", now },
);

const brain = [
  {
    slug: "brand-voice",
    title: "Brand Voice",
    area: "brand",
    content: "Bold, premium, teach-first, and direct. Never sound like a generic AI agency.",
  },
  {
    slug: "do-not-say",
    title: "Do Not Say",
    area: "brand",
    content: "Avoid: generic AI agency, fully replace your team.",
  },
];

const memory = [
  {
    id: "memorychunk_content_strategy",
    content: "Teach-first content is the center; aggressive posts are seasoning, not the whole meal.",
    trustLevel: "founder_core",
    tags: ["content"],
  },
];

const sources = [
  {
    id: "source_aios_course",
    title: "AI OS course transcript",
    sourceType: "transcript",
    trustLevel: "tier_2_approved_expert",
    chunks: [
      {
        id: "sourcechunk_aios_course_1",
        content: "AI operating systems need context, data, skills, routines, permissions, APIs, and cadence.",
      },
    ],
  },
];

const providerJson = JSON.stringify({
  packets: [
    {
      platform: "linkedin",
      format: "text",
      objective: "teach business owners why AI OS beats random automation",
      targetAudience: "Pakistani owner-led growth businesses",
      angle: "Owning the operating system beats renting scattered outputs",
      hook: "Your AI stack is not the advantage. Your operating system is.",
      mainCopy: "Most companies collect tools. The winners wire context, data, skills, routines, permissions, APIs, and cadence into one operating layer.",
      caption: "Build the system that learns with you.",
      cta: "Reply OS and we will show you where your workflow is leaking time.",
      designDirection: "Black liquid-glass WOBBLE card, electric lime evidence callouts, clean proof-led layout.",
      sourceIdsUsed: ["source_aios_course"],
      insightIdsUsed: ["insight_aios_primitives"],
      memoryChunksUsed: ["memorychunk_content_strategy"],
      evidenceSummary: "Uses approved AI OS transcript plus WOBBLE Brain content strategy.",
      claimRiskLevel: "medium",
      proofRequired: true,
      selfReview: {
        usefulness: 9,
        originality: 8,
        brandFit: 9,
        clarity: 8,
        aggressionControl: 8,
        proofStrength: 8,
        postWorthiness: "pass",
      },
    },
    {
      platform: "x",
      format: "thread",
      objective: "test a sharper aggressive angle",
      targetAudience: "founders stuck in tool chaos",
      angle: "Tool buying without context is expensive noise",
      hook: "Buying another AI tool will not save your broken workflow.",
      mainCopy: "A tool without memory, permissions, data, and cadence just creates another tab to babysit.",
      caption: "Systems beat tool chaos.",
      cta: "Audit the workflow before adding another app.",
      designDirection: "Minimal black text thread card with lime warning accent.",
      sourceIdsUsed: ["source_aios_course"],
      insightIdsUsed: ["insight_tool_chaos"],
      memoryChunksUsed: ["memorychunk_content_strategy"],
      evidenceSummary: "Grounded in approved AI OS transcript primitives.",
      claimRiskLevel: "medium",
      proofRequired: true,
      selfReview: {
        usefulness: 9,
        originality: 6,
        brandFit: 8,
        clarity: 8,
        aggressionControl: 8,
        proofStrength: 8,
        postWorthiness: "pass",
      },
    },
  ],
});

function fakeCreatePacket(input: CreateContentPacketInput & { requestApproval?: boolean }) {
  const passed = input.selfReview.originality >= 7;
  return {
    packet: {
      id: `packet_${input.platform}`,
      contentTrackId: input.contentTrackId ?? "track_wobble_company",
      platform: input.platform,
      format: input.format,
      objective: input.objective,
      targetAudience: input.targetAudience,
      angle: input.angle,
      hook: input.hook,
      mainCopy: input.mainCopy ?? "",
      carouselSlides: [],
      caption: input.caption,
      cta: input.cta,
      designDirection: input.designDirection,
      sourceIdsUsed: input.sourceIdsUsed ?? [],
      insightIdsUsed: input.insightIdsUsed ?? [],
      memoryChunksUsed: input.memoryChunksUsed ?? [],
      evidenceSummary: input.evidenceSummary ?? "",
      claimRiskLevel: input.claimRiskLevel ?? "low",
      proofRequired: input.proofRequired ?? false,
      qualityStatus: passed ? "passed" : "failed",
      approvalStatus: passed ? "pending" : "draft",
      n8nHandoffStatus: "not_sent",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    },
    approval: passed ? { id: `approval_${input.platform}` } : null,
  };
}

function deps(overrides: Partial<ContentGenerationDeps> = {}): ContentGenerationDeps {
  return {
    getContentTrack: async () => track,
    retrieveBrain: async () => brain,
    retrieveMemory: async () => memory,
    retrieveSources: async () => sources,
    runProvider: async () => ({ text: providerJson, run: { id: "modelrun_content_1" } }),
    createPacket: async (input) => fakeCreatePacket(input),
    enqueueJob: async (input) => ({
      job: {
        id: "job_content_1",
        queue: input.queue,
        type: input.type,
        payload: input.payload,
        linkedModule: input.linkedModule ?? null,
      },
      deduped: false,
    }),
    recordAudit: async () => {},
    now,
    ...overrides,
  };
}

describe("content worker domain", () => {
  it("builds a grounded prompt from track, Brain, memory, approved source chunks, and do-not-say rules", () => {
    const prompt = buildContentGenerationPrompt({
      request: { contentTrackId: "track_wobble_company", requestedBy: "Moiz", objective: "weekly content" },
      track,
      brain,
      memory,
      sources,
    });

    expect(prompt.messages[0]?.content).toContain("generic AI agency");
    expect(prompt.messages[0]?.content).toContain("AI operating systems need context, data, skills");
    expect(prompt.messages[0]?.content).toContain("Return strict JSON");
    expect(prompt.sourceIds).toEqual(["source_aios_course"]);
    expect(prompt.memoryChunkIds).toEqual(["memorychunk_content_strategy"]);
  });

  it("loads founder track voice profile into the same content worker prompt", () => {
    const prompt = buildContentGenerationPrompt({
      request: { contentTrackId: "track_moiz_founder", requestedBy: "Moiz", objective: "same insight, founder POV" },
      track: founderTrack,
      brain,
      memory,
      sources,
    });

    expect(prompt.messages[0]?.content).toContain("Track type: founder");
    expect(prompt.messages[0]?.content).toContain("Founder/persona: Moiz");
    expect(prompt.messages[0]?.content).toContain("founder-led, direct, educational");
    expect(prompt.messages[0]?.content).toContain("easy money");
  });

  it("parses multiple generated packets and rejects non-JSON model output", () => {
    const parsed = parseContentWorkerModelOutput(providerJson);
    expect(parsed.packets).toHaveLength(2);
    expect(parsed.packets[0].sourceIdsUsed).toEqual(["source_aios_course"]);
    expect(() => parseContentWorkerModelOutput("write a nice post")).toThrowError(/JSON/);
  });

  it("normalizes blank text-post captions to main copy instead of killing a provider response", () => {
    const raw = JSON.parse(providerJson);
    raw.packets[0].caption = "";

    const parsed = parseContentWorkerModelOutput(JSON.stringify(raw));

    expect(parsed.packets[0].caption).toBe(parsed.packets[0].mainCopy);
  });
});

describe("content worker service", () => {
  it("refuses to spend tokens when Brain or approved source chunk context is missing", async () => {
    const runProvider = vi.fn<NonNullable<ContentGenerationDeps["runProvider"]>>();

    await expect(
      runContentGenerationJob(
        { contentTrackId: "track_wobble_company", requestedBy: "Moiz" },
        deps({ retrieveBrain: async () => [], retrieveSources: async () => [], runProvider }),
      ),
    ).rejects.toThrowError(/requires WOBBLE Brain and approved source chunk context/);

    expect(runProvider).not.toHaveBeenCalled();
  });

  it("calls the content strategy provider and creates approval-gated packets through Content Command", async () => {
    const created: Array<CreateContentPacketInput & { requestApproval?: boolean }> = [];
    const audit: AuditEventInput[] = [];
    const runProvider = vi.fn<NonNullable<ContentGenerationDeps["runProvider"]>>(async () => ({
      text: providerJson,
      run: { id: "modelrun_content_1" },
    }));

    const result = await runContentGenerationJob(
      { contentTrackId: "track_wobble_company", requestedBy: "Moiz", objective: "weekly content", maxPackets: 4 },
      deps({
        runProvider,
        createPacket: async (input) => {
          created.push(input);
          return fakeCreatePacket(input);
        },
        recordAudit: async (event) => {
          audit.push(event);
        },
      }),
    );

    expect(runProvider).toHaveBeenCalledWith(
      expect.objectContaining({ role: "content_strategy", module: "content", linkedEntityType: "content_track" }),
    );
    expect(created).toHaveLength(2);
    expect(created.every((input) => input.requestApproval === true)).toBe(true);
    expect(result.createdPackets).toBe(2);
    expect(result.approvalsCreated).toBe(1);
    expect(result.failedDrafts).toBe(1);
    expect(audit.some((event) => event.eventType === "content_worker.completed")).toBe(true);
  });

  it("uses the same content generation engine for founder POV tracks", async () => {
    const created: Array<CreateContentPacketInput & { requestApproval?: boolean }> = [];

    const result = await runContentGenerationJob(
      { contentTrackId: "track_moiz_founder", requestedBy: "Moiz", objective: "same source, founder POV", maxPackets: 1 },
      deps({
        getContentTrack: async () => founderTrack,
        createPacket: async (input) => {
          created.push(input);
          return fakeCreatePacket(input);
        },
      }),
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      contentTrackId: "track_moiz_founder",
      createdBy: "Moiz",
      requestApproval: true,
    });
    expect(result.contentTrackId).toBe("track_moiz_founder");
  });

  it("enqueues a real content.generate job with idempotency and module linkage", async () => {
    const enqueued: unknown[] = [];

    const result = await enqueueContentGenerationJob(
      {
        contentTrackId: "track_wobble_company",
        requestedBy: "Moiz",
        objective: "weekly content",
        idempotencyKey: "content-week-1",
      },
      deps({
        enqueueJob: async (input) => {
          enqueued.push(input);
          return {
            job: {
              id: "job_content_1",
              queue: input.queue,
              type: input.type,
              payload: input.payload,
              linkedModule: input.linkedModule ?? null,
            },
            deduped: false,
          };
        },
      }),
    );

    expect(result.job.type).toBe(CONTENT_GENERATE_JOB_TYPE);
    expect(enqueued[0]).toMatchObject({
      queue: "general",
      type: CONTENT_GENERATE_JOB_TYPE,
      linkedModule: "content_command",
      linkedEntityType: "content_track",
      linkedEntityId: "track_wobble_company",
      idempotencyKey: "content-week-1",
    });
  });
});
