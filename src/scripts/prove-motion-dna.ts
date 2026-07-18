/**
 * WOBBLE Motion DNA (execution-order step 19) — completes the creative-intelligence trilogy (Design DNA +
 * Static Creative DNA + Motion DNA) from the real Phase-9 reel library. No new table.
 *
 * Two layers, both real:
 *  1. Structural Motion DNA → the `design` bank: the reel manifest (140 reels / 600 voice clips / 103 TTS
 *     configs / 34+31 HyperFrames compositions) + the universal reel spine + the 16 format archetypes.
 *     Taken faithfully from PHASE-9-VIDEO-REELS/REEL-FORMAT-LIBRARY.md — nothing invented.
 *  2. Motion knowledge playbooks → the knowledge engine (createSource → attachSourceChunks → compileSource),
 *     producing cited notes with provenance, exactly like the marketing-knowledge ingest.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-motion-dna.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { closeDb } from "@/db";
import { createMemoryRecord } from "@/lib/memory";
import { createSource, approveSource, attachSourceChunks, listSources } from "@/lib/sources";
import { compileSource } from "@/lib/knowledge";

const FOUNDER = "Moiz";
const P9 = "C:/Users/moizk/OneDrive/Documents/Claude/Projects/Marketing campaign/PHASE-9-VIDEO-REELS";

// Layer 1 — structural Motion DNA (design bank), from the manifest + REEL-FORMAT-LIBRARY.md.
const STRUCTURAL_FACTS = [
  {
    area: "motion_dna_reel_system",
    title: "WOBBLE Motion DNA — reel system & spine",
    content:
      "WOBBLE's reel library = 140 rendered reels + 600 voice clips + 103 TTS/voice configs + 34 HTML & 31 JS HyperFrames compositions + 61 reference stills. Universal reel spine: Hook (1.5s) → Value/Proof → mechanism reveal → soft CTA. DR reels 9-30s, teaching reels 45-60s. Value model: front-load real value (first ~70%), reveal the MECHANISM not the tedium ('we install it in 48h, you never touch it'), 80-90% education + last 10-20% 'why us', proof mid-roll (flash one number / 1s dashboard). ONE soft CTA = 'Book a free AI audit — link in bio' (NO comment-bait, per client rule).",
  },
  {
    area: "motion_dna_formats",
    title: "WOBBLE Motion DNA — 16 format archetypes & variety engine",
    content:
      "WOBBLE reels rotate 16 format archetypes: Myth-Bust, Objection Killer, 5 Things (checklist, most-saved), Mistake, Cost-of-Inaction Math, Before/After, Nobody Tells You, Comparison/Vs, Teardown, Steal-This/Template, Contrarian Take, Day-in-the-Life (of the system), Question-Hook, Case-Study/Proof, Confession, Data-Shock. Variety engine = 16 formats × 6 angles (fear-of-loss/greed/status/curiosity/relief/contrarian) × 6 hook-triggers (stat/question/bold-claim/story/you-callout/visual-interrupt) = 576 distinct reels. Guardrails: no format twice in a row, cap any format ≤15-20% of the slate, vary the FIRST FRAME visually, re-skin winners across services, rotate the proof number.",
  },
];

// Layer 2 — Motion playbooks compiled through the knowledge engine.
const PLAYBOOKS = [
  "REEL-FORMAT-LIBRARY", "EFFECTS-LIBRARY", "RETENTION-PLAYBOOK", "ANGLE-BANK",
  "VIDEO-SCRIPT-PLAYBOOK", "CONVERSION-PSYCHOLOGY", "VISUAL-VARIETY-EXPANSION",
  "VIDEO-REEL-SYSTEM", "PRODUCTION-PROCESS", "REEL-MASTER-PLAN", "CAMPAIGN-PLAN",
];

function sectionChunks(md: string): string[] {
  return md.split(/\n(?=#{1,2} )/g).map((s) => s.trim()).filter((s) => s.length > 0).map((p) => p.slice(0, 6000));
}

async function main() {
  // Layer 1
  for (const f of STRUCTURAL_FACTS) {
    await createMemoryRecord({
      title: f.title, content: f.content, area: f.area,
      memoryTier: "working", trustLevel: "founder_core", bankSlugs: ["design"], createdBy: FOUNDER,
    });
    console.log(`  seeded Motion DNA: ${f.title}`);
  }

  // Layer 2
  const existingTitles = new Set((await listSources({ limit: 500 })).map((s) => s.title));
  let ingested = 0, skipped = 0, totalChunks = 0, totalNotes = 0;
  for (const name of PLAYBOOKS) {
    const path = `${P9}/${name}.md`;
    if (!existsSync(path)) { console.log(`  (missing ${name}.md — skipped)`); continue; }
    const title = `WOBBLE Motion Playbook — ${name}`;
    if (existingTitles.has(title)) { skipped += 1; continue; }
    const md = readFileSync(path, "utf8");
    const chunks = sectionChunks(md);

    const created = await createSource({
      title, sourceType: "internal_company_document", ownerScope: "company",
      intendedUse: ["motion_dna", "creative_knowledge"], trustLevel: "tier_2_approved_expert",
      addedBy: FOUNDER, metadata: { phase: "phase-9-video-reels", file: `${name}.md`, sections: chunks.length },
    });
    if (!created.autoActivated) {
      await approveSource({ sourceId: created.source.id, approvalId: created.approval.id, approvedBy: FOUNDER, trustLevel: "tier_2_approved_expert" });
    }
    await attachSourceChunks({ sourceId: created.source.id, chunks });
    totalChunks += chunks.length;
    const compiled = await compileSource({ sourceId: created.source.id, triggeredBy: FOUNDER });
    totalNotes += compiled.notesCreated;
    ingested += 1;
    console.log(`  [${ingested}] ${name} — ${chunks.length} chunks, ${compiled.notesCreated} notes`);
  }
  console.log(`\n  DONE: 2 structural Motion DNA facts + ${ingested} playbooks (${skipped} present), ${totalChunks} chunks, ${totalNotes} notes.`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
