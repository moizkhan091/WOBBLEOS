import { describe, expect, it } from "vitest";
import {
  buildSourceIntakeRunRow,
  buildSourceRow,
  buildSourceTypeDefinitionRow,
  DEFAULT_SOURCE_TYPE_DEFINITIONS,
  resolveSourceTypeDefinition,
  type SourceIntakeRunRow,
  type SourceRow,
  type SourceTypeDefinitionRow,
} from "@/lib/domain/sources";
import {
  createSourceIntakeRun,
  listSourceIntakeRuns,
  listSourceTypeDefinitions,
  markSourceIntakeRunComplete,
  type SourceLibraryStore,
} from "@/lib/sources";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-07-02T09:00:00.000Z");

describe("source registry domain", () => {
  it("ships rich source type definitions for the minimum hive-mind intake set", () => {
    const slugs = DEFAULT_SOURCE_TYPE_DEFINITIONS.map((definition) => definition.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "website",
        "blog",
        "rss_feed",
        "youtube_video",
        "youtube_channel",
        "instagram_reel",
        "instagram_post",
        "instagram_carousel",
        "instagram_profile",
        "tiktok_video",
        "tiktok_profile",
        "reddit_post",
        "reddit_thread_feed",
        "competitor_website",
        "competitor_social_profile",
        "design_reference",
        "brand_reference",
        "market_research_source",
        "client_source",
        "internal_company_document",
        "uploaded_file",
        "manual_note",
        "api_source",
        "n8n_source",
      ]),
    );
    expect(resolveSourceTypeDefinition("instagram_carousel")).toMatchObject({
      slug: "instagram_carousel",
      requiresVision: true,
      defaultConnectedAgents: expect.arrayContaining(["source_intake_orchestrator", "visual_reference_analyst"]),
      defaultMemoryBanks: expect.arrayContaining(["design", "content", "competitor"]),
    });
  });

  it("adds registry metadata to every source without making it trusted", () => {
    const row = buildSourceRow(
      {
        title: "Competitor carousel",
        sourceType: "instagram_carousel",
        url: "https://instagram.com/p/example",
        addedBy: "Moiz",
        ownerScope: "company",
        intendedUse: ["content_strategy", "design_reference"],
        refreshFrequency: "weekly",
      },
      { id: "source_carousel", now },
    );

    expect(row).toMatchObject({
      id: "source_carousel",
      sourceType: "instagram_carousel",
      approvalStatus: "pending",
      processingStatus: "pending_approval",
      ownerScope: "company",
      intendedUse: ["content_strategy", "design_reference"],
      connectedAgents: expect.arrayContaining(["source_intake_orchestrator", "visual_reference_analyst"]),
      refreshFrequency: "weekly",
      memoryBanksFed: [],
      relatedOutputIds: [],
      costUsed: "0",
    });
  });

  it("builds source intake runs with status, logs, cost, and provenance", () => {
    const run = buildSourceIntakeRunRow(
      {
        sourceId: "source_1",
        sourceType: "youtube_video",
        handlerSlug: "youtube_video",
        trigger: "manual",
        tool: "apify",
        agentRunId: "agentrun_1",
        jobId: "job_1",
        status: "queued",
        logs: [{ level: "info", message: "queued transcript extraction" }],
        costEstimate: 0.02,
      },
      { id: "intake_1", now },
    );

    expect(run).toMatchObject({
      id: "intake_1",
      sourceId: "source_1",
      sourceType: "youtube_video",
      handlerSlug: "youtube_video",
      trigger: "manual",
      status: "queued",
      tool: "apify",
      costEstimate: "0.02",
      rawPayloadRef: null,
      extractedInsightId: null,
      startedAt: now,
      completedAt: null,
    });
  });
});

describe("source registry service", () => {
  it("creates an intake run, updates the source processing status, and audits", async () => {
    const source = buildSourceRow({ title: "Reel", sourceType: "instagram_reel", addedBy: "Moiz" }, { id: "source_1", now });
    const { store, sources, intakeRuns } = makeSourceRegistryStore([source]);
    const audit: AuditEventInput[] = [];

    const result = await createSourceIntakeRun(
      {
        sourceId: "source_1",
        trigger: "n8n",
        tool: "apify",
        agentRunId: "agentrun_1",
        logs: [{ level: "info", message: "n8n scrape accepted" }],
      },
      { store, recordAudit: async (event) => void audit.push(event), now },
    );

    expect(result.run.sourceType).toBe("instagram_reel");
    expect(result.run.handlerSlug).toBe("instagram_reel");
    expect(intakeRuns).toHaveLength(1);
    expect(sources.get("source_1")?.processingStatus).toBe("queued");
    expect(audit.map((event) => event.eventType)).toContain("source.intake.queued");
  });

  it("completes an intake run and writes extracted data, banks, confidence, cost, and last scrape time", async () => {
    const source = buildSourceRow({ title: "Website", sourceType: "website", addedBy: "Moiz" }, { id: "source_1", now });
    const run = buildSourceIntakeRunRow({ sourceId: "source_1", sourceType: "website" }, { id: "intake_1", now });
    const { store, sources, intakeRuns } = makeSourceRegistryStore([source], [run]);
    const audit: AuditEventInput[] = [];

    const result = await markSourceIntakeRunComplete(
      {
        intakeRunId: "intake_1",
        status: "succeeded",
        rawPayloadRef: "/storage/sources/source_1/raw.json",
        extractedInsightId: "intel_1",
        extractedData: { positioning: "AI workforce company" },
        memoryBanksFed: ["competitor", "offer", "seo"],
        relatedOutputIds: ["packet_1"],
        confidence: 0.82,
        costUsed: 0.17,
        logs: [{ level: "info", message: "analysis stored" }],
      },
      { store, recordAudit: async (event) => void audit.push(event), now },
    );

    expect(result.run.status).toBe("succeeded");
    expect(intakeRuns[0]).toMatchObject({ completedAt: now, extractedInsightId: "intel_1" });
    expect(sources.get("source_1")).toMatchObject({
      processingStatus: "succeeded",
      confidence: "0.82",
      costUsed: "0.17",
      memoryBanksFed: ["competitor", "offer", "seo"],
      relatedOutputIds: ["packet_1"],
      extractedData: { positioning: "AI workforce company" },
      lastScrapedAt: now,
    });
    expect(audit.map((event) => event.eventType)).toContain("source.intake.succeeded");
  });

  it("lists source type definitions and intake runs for UI/agents", async () => {
    const run = buildSourceIntakeRunRow({ sourceId: "source_1", sourceType: "website" }, { id: "intake_1", now });
    const { store } = makeSourceRegistryStore([], [run]);

    const definitions = await listSourceTypeDefinitions({ store, limit: 100 });
    const runs = await listSourceIntakeRuns({ sourceId: "source_1", store, limit: 10 });

    expect(definitions.map((definition) => definition.slug)).toContain("youtube_video");
    expect(runs.map((item) => item.id)).toEqual(["intake_1"]);
  });
});

function makeSourceRegistryStore(seedSources: SourceRow[] = [], seedRuns: SourceIntakeRunRow[] = []) {
  const sources = new Map(seedSources.map((source) => [source.id, source]));
  const intakeRuns = [...seedRuns];
  const definitions: SourceTypeDefinitionRow[] = DEFAULT_SOURCE_TYPE_DEFINITIONS.map((definition) =>
    buildSourceTypeDefinitionRow(definition, { id: `sourcetype_${definition.slug}`, now }),
  );

  const store: SourceLibraryStore = {
    insertSource: async (row) => void sources.set(row.id, row),
    insertFile: async () => {},
    getSourceById: async (id) => sources.get(id) ?? null,
    updateSource: async (id, fields) => {
      const current = sources.get(id);
      if (current) sources.set(id, { ...current, ...fields } as SourceRow);
    },
    insertSourceChunks: async () => {},
    listSources: async (query) => [...sources.values()].slice(0, query.limit),
    listApprovedSourcesForJobs: async () => [],
    insertSourceIntakeRun: async (row) => void intakeRuns.push(row),
    getSourceIntakeRunById: async (id) => intakeRuns.find((run) => run.id === id) ?? null,
    updateSourceIntakeRun: async (id, fields) => {
      const index = intakeRuns.findIndex((run) => run.id === id);
      if (index >= 0) intakeRuns[index] = { ...intakeRuns[index], ...fields } as SourceIntakeRunRow;
    },
    listSourceIntakeRuns: async (query) =>
      intakeRuns.filter((run) => (query.sourceId ? run.sourceId === query.sourceId : true)).slice(0, query.limit),
    listSourceTypeDefinitions: async (query) => definitions.slice(0, query.limit),
  };

  return { store, sources, intakeRuns, definitions };
}
