/**
 * RELEASE-CANDIDATE media OUTPUT-QUALITY acceptance driver (ONE controlled paid image call — a few cents).
 *
 * Deliberately NOT named verify-*-db.ts: the CI gate must never auto-run a paid call. This driver exists so
 * the acceptance is reproducible and its evidence (cost, audit, isolation) is captured mechanically; the
 * VISUAL quality evaluation (prompt adherence, composition, typography, brand fidelity, realism, artifacts,
 * reference fidelity, channel suitability) is performed by a human/agent looking at the produced PNG, and its
 * verdict is recorded in docs/RELEASE_CANDIDATE_ACCEPTANCE.md.
 *
 * What it does:
 *   1. loads a WOBBLE brand-reference image as multimodal reference context;
 *   2. files a REALISTIC client brief (Alpha Dental Instagram ad card) as a durable media job, scoped to
 *      clientId 'client-alpha-dental' — through createMediaJob (validation, budget cap, dedupe);
 *   3. runs the real media worker cycle (atomic claim → OpenRouter image call → durable storage);
 *   4. prints the FULL evidence bundle: status, cost, output path, audit events, and the client-isolation
 *      checks (job carries ONLY alpha's clientId; a beta-scoped query cannot see it; no foreign canary
 *      anywhere in the job row).
 *
 * Run: DATABASE_URL=... OPENROUTER_API_KEY=... npx tsx src/scripts/accept-media-image-quality.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { mediaJobs, auditLogs } from "@/db/schema";
import { createMediaJob } from "@/lib/media";
import { runMediaWorkerCycle } from "@/lib/media/worker";

const ALPHA = "client-alpha-dental";
const FOREIGN_CANARIES = ["BETA-ONLY-4M2P", "GAMMA-ONLY-9X3D"];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const db = getDb();

  // 1. Brand reference → multimodal context (the founder-approved WOBBLE reference set in assets/).
  const refPath = path.join(process.cwd(), "assets", "brand-references", "notebook-database.png");
  const refDataUrl = `data:image/png;base64,${readFileSync(refPath).toString("base64")}`;

  // 2. A realistic client brief — the kind a founder would actually run for a dental client's IG ad.
  const brief = [
    "Instagram ad card, 1:1 square, for a modern dental clinic ('Alpha Dental').",
    "Composition: a calm, premium dental reception in soft natural light, slightly out of focus as the background.",
    "Foreground: bold typographic headline, perfectly legible, high contrast against the background:",
    "  headline: \"Missed calls are missed patients.\"",
    "  subline (smaller): \"WOBBLE AI answers every one.\"",
    "Typography must be clean, unbroken, correctly spelled — no warped or invented letters.",
    "Style: premium, minimal, editorial — match the aesthetic direction of the attached brand reference (dark, moody, focused product lighting).",
    "No people's faces in sharp focus. No clutter. No watermark.",
  ].join("\n");

  const created = await createMediaJob({
    kind: "image",
    prompt: brief,
    params: { referenceImages: [refDataUrl] },
    estimatedCostCents: 8,
    budgetCapCents: 20,
    scopeType: "client",
    clientId: ALPHA,
    requestedBy: "Moiz",
    dedupeKey: `rc-accept-image-${new Date().toISOString().slice(0, 10)}`,
  });
  if (!created.ok || !created.job) throw new Error(`createMediaJob failed: ${created.error ?? created.errors?.join("; ")}`);
  const jobId = created.job.id;
  console.log(`job created: ${jobId} (deduped=${Boolean(created.deduped)}) provider=${created.job.provider} clientId=${created.job.clientId}`);

  // 3. The real worker cycle (claim → generate → store). One cycle handles one queued job.
  if (!created.deduped) await runMediaWorkerCycle();

  // 4. Evidence bundle.
  const row = (await db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)))[0];
  console.log("RESULT status:", row.status, "| provider:", row.provider, "| actualCostCents:", row.actualCostCents, "| error:", row.error ?? "");
  console.log("outputRefs:", JSON.stringify(row.outputRefs));
  const storageRoot = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
  for (const ref of row.outputRefs) console.log("artifact:", path.join(storageRoot, ref));

  // Client isolation on the media system itself:
  const rowText = JSON.stringify(row);
  const leaked = FOREIGN_CANARIES.filter((c) => rowText.includes(c));
  if (leaked.length) throw new Error(`P0: foreign client canary in the media job row: ${leaked.join(",")}`);
  if (row.clientId !== ALPHA) throw new Error(`P0: job clientId is '${row.clientId}', expected '${ALPHA}'`);
  const betaView = await db.select().from(mediaJobs).where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.clientId, "client-beta-construction")));
  if (betaView.length !== 0) throw new Error("P0: a beta-scoped query can see alpha's media job");
  console.log("isolation: job is alpha-scoped only; beta-scoped query sees nothing; no foreign canary in the row ✓");

  // Audit trail for the job:
  const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, jobId));
  console.log("audit events:", audits.map((a) => a.eventType).join(", ") || "(none)");

  await closeDb().catch(() => {});
  process.exit(row.status === "succeeded" ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
