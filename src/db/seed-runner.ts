import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, schema } from "@/db";
import {
  initialApprovalActions,
  initialBudgetCaps,
  initialContentTracks,
  initialFounderProfiles,
  initialProviderConnections,
  initialMemoryBanks,
  initialTasteProfiles,
  initialSourceTypeDefinitions,
  initialSourceTrustLevels,
  initialWobbleBrainRecords,
} from "@/db/seed";
import { DEFAULT_PROMPT_SKILLS, buildPromptSkillRow } from "@/lib/domain/prompt-skills";
import { DEFAULT_AGENTS, buildAgentRow } from "@/lib/domain/agents";
import { buildSourceTypeDefinitionRow } from "@/lib/domain/sources";
import { buildMemoryBankRow } from "@/lib/domain/memory";
import { buildTasteProfileRow } from "@/lib/domain/taste";
import { DEFAULT_MODEL_CATALOG } from "@/lib/domain/model-registry";

function loadEnvFile(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2];
    if (!process.env[key]) process.env[key] = value;
  }
}

function modelRoles() {
  const or = (model: string) => ({ provider: "openrouter", model });
  // "default" is the house fallback: any agent role not explicitly mapped resolves to this
  // (see resolveModelRole) so a new agent never crashes a run on an unmapped role.
  return {
    default: or(process.env.DEFAULT_MODEL?.trim() || "openai/gpt-4o-mini"),
    ask_wobble: or(process.env.ASK_WOBBLE_MODEL?.trim() || "openai/gpt-4o-mini"),
    content_strategy: or(process.env.CONTENT_STRATEGY_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    content_research: or(process.env.CONTENT_RESEARCH_MODEL?.trim() || "openai/gpt-4o-mini"),
    content_copywriting: or(process.env.CONTENT_COPYWRITING_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    content_scoring: or(process.env.CONTENT_SCORING_MODEL?.trim() || "openai/gpt-4o-mini"),
    knowledge_compiler: or(process.env.KNOWLEDGE_COMPILER_MODEL?.trim() || "openai/gpt-4o-mini"),
    memory_router: or(process.env.MEMORY_ROUTER_MODEL?.trim() || "openai/gpt-4o-mini"),
    // Paid Audit team (McKinsey-depth): strong models for reasoning-heavy nodes, cheap for extraction.
    audit_discovery: or(process.env.AUDIT_DISCOVERY_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    audit_opportunity: or(process.env.AUDIT_OPPORTUNITY_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    audit_prioritization: or(process.env.AUDIT_PRIORITIZATION_MODEL?.trim() || "openai/gpt-4o-mini"),
    audit_roadmap: or(process.env.AUDIT_ROADMAP_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    audit_report: or(process.env.AUDIT_REPORT_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
    pitch_writer: or(process.env.PITCH_WRITER_MODEL?.trim() || "anthropic/claude-sonnet-4.5"),
  };
}

function seedMemoryBanksForArea(area: string): string[] {
  const areaMap: Record<string, string[]> = {
    brand: ["brand", "company"],
    icp: ["brand", "company"],
    offer: ["offer", "company"],
    content: ["content", "company"],
    founder: ["founder_taste", "company"],
    team: ["company", "agent_learning"],
    strategy: ["company", "research"],
    market: ["research", "competitor"],
  };
  return areaMap[area] ?? ["company"];
}

export async function seedDatabase() {
  loadEnvFile();
  const db = getDb();
  const now = new Date();

  await db
    .insert(schema.founderProfiles)
    .values(initialFounderProfiles.map((row) => ({ ...row, metadata: {} })))
    .onConflictDoUpdate({
      target: schema.founderProfiles.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.sourceTrustLevels)
    .values(initialSourceTrustLevels.map((row) => ({ ...row })))
    .onConflictDoUpdate({
      target: schema.sourceTrustLevels.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.sourceTypeDefinitions)
    .values(initialSourceTypeDefinitions.map((definition) => buildSourceTypeDefinitionRow(definition, { id: `sourcetype_${definition.slug}` })))
    .onConflictDoUpdate({
      target: schema.sourceTypeDefinitions.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.memoryBanks)
    .values(initialMemoryBanks.map((bank) => buildMemoryBankRow(bank, { id: `memorybank_${bank.slug}` })))
    .onConflictDoUpdate({
      target: schema.memoryBanks.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.tasteProfiles)
    .values(
      initialTasteProfiles.map((profile) =>
        buildTasteProfileRow(profile, {
          id: `taste_${String(profile.profileKey ?? profile.scope).replace(/[^a-zA-Z0-9_]+/g, "_")}`,
          now,
        }),
      ),
    )
    .onConflictDoUpdate({
      target: schema.tasteProfiles.profileKey,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.approvalActions)
    .values(initialApprovalActions.map((row) => ({ ...row })))
    .onConflictDoUpdate({
      target: schema.approvalActions.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.contentTracks)
    .values(
      initialContentTracks.map((row) => ({
        ...row,
        voiceProfile: { ...row.voiceProfile },
        goals: [...row.goals],
        allowedTopics: [...row.allowedTopics],
        bannedPhrases: [...row.bannedPhrases],
        aggressionRange: { ...row.aggressionRange },
        platformPriorities: [...row.platformPriorities],
        metadata: { ...row.metadata },
      })),
    )
    .onConflictDoUpdate({
      target: schema.contentTracks.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.memoryRecords)
    .values(
      initialWobbleBrainRecords.map((row) => ({
        ...row,
        status: "active",
        sourceId: null,
        confidence: "1",
        bankSlugs: seedMemoryBanksForArea(row.area),
        approvedBy: "system_seed",
        approvedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: schema.memoryRecords.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.memoryChunks)
    .values(
      initialWobbleBrainRecords.map((row) => ({
        id: `memorychunk_${row.slug}`,
        memoryRecordId: row.id,
        content: row.content,
        memoryTier: row.memoryTier,
        trustLevel: "founder_core",
        sourceId: null,
        parentEntityId: row.id,
        entityType: "memory_record",
        status: "active",
        archived: false,
        tags: [row.area, "seed"],
        bankSlugs: seedMemoryBanksForArea(row.area),
      })),
    )
    .onConflictDoUpdate({
      target: schema.memoryChunks.id,
      set: { archived: false, status: "active", updatedAt: now },
    });

  await db
    .insert(schema.memoryBankLinks)
    .values(
      initialWobbleBrainRecords.flatMap((row) =>
        seedMemoryBanksForArea(row.area).flatMap((bankSlug) => [
          {
            id: `memorybanklink_${row.slug}_${bankSlug}_record`,
            memoryBankSlug: bankSlug,
            memoryRecordId: row.id,
            memoryChunkId: null,
            sourceId: null,
            proposalId: null,
            linkType: "seed",
            createdBy: "system_seed",
          },
          {
            id: `memorybanklink_${row.slug}_${bankSlug}_chunk`,
            memoryBankSlug: bankSlug,
            memoryRecordId: row.id,
            memoryChunkId: `memorychunk_${row.slug}`,
            sourceId: null,
            proposalId: null,
            linkType: "seed",
            createdBy: "system_seed",
          },
        ]),
      ),
    )
    .onConflictDoUpdate({
      target: schema.memoryBankLinks.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.budgetCaps)
    .values(initialBudgetCaps.map((row) => ({ ...row, enabled: true })))
    .onConflictDoUpdate({
      target: schema.budgetCaps.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.providerConnections)
    .values(
      initialProviderConnections.map((row) => ({
        ...row,
        enabled: row.slug === "openrouter",
        permissionMode: "read_write",
        healthStatus: "unknown",
        allowedModules: [...row.allowedModules],
        metadata: {},
      })),
    )
    .onConflictDoUpdate({
      target: schema.providerConnections.id,
      set: { updatedAt: now },
    });

  await db
    .insert(schema.settings)
    .values({
      id: "setting_model_roles",
      key: "model_roles",
      scope: "global",
      value: modelRoles(),
      description: "Model-role routing for provider adapter calls. Editable in Settings later.",
    })
    // Do NOT clobber runtime model swaps on re-seed — user/model-registry changes are sovereign.
    .onConflictDoNothing();

  await db
    .insert(schema.settings)
    .values({
      id: "setting_model_catalog",
      key: "model_catalog",
      scope: "global",
      value: { models: DEFAULT_MODEL_CATALOG },
      description: "Known models + capabilities for validated, swappable model routing. Editable in Settings.",
    })
    // Preserve runtime catalog edits (user-added models) on re-seed.
    .onConflictDoNothing();

  await db
    .insert(schema.promptSkills)
    .values(
      DEFAULT_PROMPT_SKILLS.map((skill) => ({
        ...buildPromptSkillRow(skill, { id: `skill_${skill.slug}_v1`, version: 1, status: "approved" }),
        approvedBy: "system_seed",
        approvedAt: new Date(),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.agents)
    .values(DEFAULT_AGENTS.map((a) => buildAgentRow(a, { id: `agent_${a.slug}` })))
    .onConflictDoNothing();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  seedDatabase()
    .then(async () => {
      console.log("db_seed=ok");
      console.log(`ask_wobble_model=${process.env.ASK_WOBBLE_MODEL?.trim() || "openai/gpt-4o-mini"}`);
      console.log(`content_strategy_model=${process.env.CONTENT_STRATEGY_MODEL?.trim() || "anthropic/claude-sonnet-4.5"}`);
      console.log(`memory_router_model=${process.env.MEMORY_ROUTER_MODEL?.trim() || "openai/gpt-4o-mini"}`);
    })
    .catch((error) => {
      console.error("db_seed=failed");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
