import { and, desc, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed-runner";
import { approveSkillVersion, loadApprovedSkill, proposeSkillVersion } from "@/lib/prompt-skills";

const LIVE_MARKER = "LIVE_SKILL_CHECK_MARKER_DO_NOT_KEEP_ACTIVE";

async function run() {
  await seedDatabase();

  const original = await loadApprovedSkill("content_generation");
  if (!original) {
    throw new Error("content_generation approved skill was not seeded");
  }

  const db = getDb();
  const approvedCount = await db
    .select()
    .from(schema.promptSkills)
    .where(eq(schema.promptSkills.status, "approved"));

  if (approvedCount.length < 6) {
    throw new Error(`expected at least 6 approved seed skills, found ${approvedCount.length}`);
  }

  const proposed = await proposeSkillVersion(original.id, {
    requestedBy: "Codex live skill check",
    goal: original.goal,
    promptBody: `${original.promptBody}\n\n${LIVE_MARKER}: this proves workers can load an approved registry update without code changes.`,
    rules: original.rules,
    referencePaths: original.referencePaths,
  });

  const stillOriginal = await loadApprovedSkill("content_generation");
  if (!stillOriginal || stillOriginal.id !== original.id) {
    throw new Error("draft skill version was loaded before approval");
  }

  await approveSkillVersion({
    skillId: proposed.skill.id,
    approvalId: proposed.approval.id,
    approvedBy: "Moiz",
    notes: "Codex live check approval",
  });

  const markerVersion = await loadApprovedSkill("content_generation");
  if (!markerVersion || markerVersion.id !== proposed.skill.id || !markerVersion.promptBody.includes(LIVE_MARKER)) {
    throw new Error("approved skill version was not loaded by the registry");
  }

  const restore = await proposeSkillVersion(markerVersion.id, {
    requestedBy: "Codex live skill check restore",
    name: original.name,
    trigger: original.trigger,
    goal: original.goal,
    promptBody: original.promptBody,
    rules: original.rules,
    referencePaths: original.referencePaths,
  });

  await approveSkillVersion({
    skillId: restore.skill.id,
    approvalId: restore.approval.id,
    approvedBy: "Moiz",
    notes: "Restore original content_generation skill after live check",
  });

  const restored = await loadApprovedSkill("content_generation");
  if (!restored || restored.id !== restore.skill.id || restored.promptBody.includes(LIVE_MARKER)) {
    throw new Error("content_generation skill was not restored after live check");
  }

  const [latestSkillAudit] = await db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.eventType, "skill.approved"), eq(schema.auditLogs.entityId, restore.skill.id)))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1);

  if (!latestSkillAudit) {
    throw new Error("skill approval audit event was not written");
  }

  console.log("skill_live_check=ok");
  console.log(`approved_seed_skills=${approvedCount.length}`);
  console.log(`original_version=${original.version}`);
  console.log(`marker_version=${markerVersion.version}`);
  console.log(`restored_version=${restored.version}`);
  console.log(`active_skill_id=${restored.id}`);
}

run()
  .catch((error) => {
    console.error("skill_live_check=failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
