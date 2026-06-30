import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  initialApprovalActions,
  initialBudgetCaps,
  initialFounderProfiles,
  initialProviderConnections,
  initialPromptSkills,
  initialSourceTrustLevels,
  initialWobbleBrainRecords,
} from "@/db/seed";

const requiredTableExports = [
  "founderProfiles",
  "authSessions",
  "settings",
  "jobs",
  "jobAttempts",
  "workerHeartbeats",
  "sources",
  "files",
  "sourceChunks",
  "memoryRecords",
  "memoryChunks",
  "memoryUpdateProposals",
  "approvals",
  "approvalActions",
  "contentPackets",
  "contentVersions",
  "qualityReviews",
  "modelRuns",
  "providerRuns",
  "auditLogs",
  "webhookEndpoints",
  "webhookEvents",
  "deadLetters",
  "budgetCaps",
  "automations",
  "automationRuns",
  "backupRuns",
  "providerConnections",
  "promptSkills",
  "researchTargets",
  "intelligenceItems",
  "intelligenceInsights",
  "intelligenceSuggestions",
  "experiments",
  "outputIntelligenceUsage",
] as const;

const requiredSqlTables = [
  "founder_profiles",
  "auth_sessions",
  "settings",
  "jobs",
  "job_attempts",
  "worker_heartbeats",
  "sources",
  "files",
  "source_chunks",
  "memory_records",
  "memory_chunks",
  "memory_update_proposals",
  "approvals",
  "approval_actions",
  "content_packets",
  "content_versions",
  "quality_reviews",
  "model_runs",
  "provider_runs",
  "audit_logs",
  "webhook_endpoints",
  "webhook_events",
  "dead_letters",
  "budget_caps",
  "automations",
  "automation_runs",
  "backup_runs",
  "provider_connections",
  "prompt_skills",
] as const;

const requiredIntelligenceSqlTables = [
  "research_targets",
  "intelligence_items",
  "intelligence_insights",
  "intelligence_suggestions",
  "experiments",
  "output_intelligence_usage",
] as const;

describe("database foundation", () => {
  it("exports every foundational V2 table from the Drizzle schema", () => {
    for (const tableName of requiredTableExports) {
      expect(schema[tableName], `${tableName} table export is missing`).toBeDefined();
    }
  });

  it("initializes pgvector before creating vector-backed memory chunks", () => {
    const migration = readFileSync(join(process.cwd(), "src/db/migrations/0000_init_pgvector.sql"), "utf8");
    const extensionIndex = migration.indexOf("CREATE EXTENSION IF NOT EXISTS vector");
    const memoryChunkIndex = migration.indexOf("CREATE TABLE IF NOT EXISTS memory_chunks");

    expect(extensionIndex).toBeGreaterThanOrEqual(0);
    expect(memoryChunkIndex).toBeGreaterThan(extensionIndex);
    expect(migration).toContain("embedding vector(1536)");
  });

  it("creates every foundational table in the initial SQL migration", () => {
    const migration = readFileSync(join(process.cwd(), "src/db/migrations/0000_init_pgvector.sql"), "utf8");

    for (const tableName of requiredSqlTables) {
      expect(migration, `${tableName} is missing from the initial migration`).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("creates every intelligence foundation table in SQL migrations", () => {
    const migrations = [
      readFileSync(join(process.cwd(), "src/db/migrations/0000_init_pgvector.sql"), "utf8"),
      readFileSync(join(process.cwd(), "src/db/migrations/0002_intelligence_foundation.sql"), "utf8"),
    ].join("\n");

    for (const tableName of requiredIntelligenceSqlTables) {
      expect(migrations, `${tableName} is missing from SQL migrations`).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("ships seed data for the WOBBLE Brain, approvals, trust, providers, prompts, founders, and budgets", () => {
    expect(initialWobbleBrainRecords.map((record) => record.slug)).toEqual([
      "about-wobble",
      "brand-voice",
      "icp",
      "offers",
      "content-strategy",
      "do-not-say",
      "founder-preferences",
      "team-and-roles",
      "current-priorities",
      "competitor-landscape",
    ]);

    expect(initialSourceTrustLevels.map((level) => level.slug)).toEqual([
      "tier_1_core_wobble",
      "tier_2_approved_expert",
      "tier_3_monitored",
      "tier_4_experimental",
      "blocked",
    ]);

    expect(initialApprovalActions.map((action) => action.slug)).toEqual([
      "approve",
      "reject",
      "request_revision",
      "regenerate",
      "edit_manually",
      "archive",
      "send_to_n8n",
      "retry_handoff",
      "mark_final",
    ]);

    expect(initialFounderProfiles.map((founder) => founder.displayName)).toContain("Moiz");
    expect(initialFounderProfiles.map((founder) => founder.displayName)).toContain("Haad");
    expect(initialBudgetCaps.map((cap) => cap.category)).toEqual(expect.arrayContaining(["openrouter", "search", "media", "video"]));
    expect(initialProviderConnections.map((provider) => provider.slug)).toEqual(expect.arrayContaining(["openrouter", "n8n", "fal_seedance"]));
    expect(initialPromptSkills.map((skill) => skill.slug)).toEqual(expect.arrayContaining(["wobble_linkedin_post", "research_radar", "decision_brief"]));
  });
});
