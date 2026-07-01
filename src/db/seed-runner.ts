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
  initialSourceTrustLevels,
  initialWobbleBrainRecords,
} from "@/db/seed";
import { DEFAULT_PROMPT_SKILLS, buildPromptSkillRow } from "@/lib/domain/prompt-skills";

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
  return {
    ask_wobble: {
      provider: "openrouter",
      model: process.env.ASK_WOBBLE_MODEL?.trim() || "openai/gpt-4o-mini",
    },
    content_strategy: {
      provider: "openrouter",
      model: process.env.CONTENT_STRATEGY_MODEL?.trim() || "anthropic/claude-sonnet-4.5",
    },
  };
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
      })),
    )
    .onConflictDoUpdate({
      target: schema.memoryChunks.id,
      set: { archived: false, status: "active", updatedAt: now },
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
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { value: modelRoles(), updatedAt: now },
    });

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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  seedDatabase()
    .then(async () => {
      console.log("db_seed=ok");
      console.log(`ask_wobble_model=${process.env.ASK_WOBBLE_MODEL?.trim() || "openai/gpt-4o-mini"}`);
      console.log(`content_strategy_model=${process.env.CONTENT_STRATEGY_MODEL?.trim() || "anthropic/claude-sonnet-4.5"}`);
    })
    .catch((error) => {
      console.error("db_seed=failed");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
