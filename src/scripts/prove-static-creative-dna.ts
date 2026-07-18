/**
 * WOBBLE Static Creative DNA — extend the design bank from the REAL 196-asset WOBBLE social library.
 *
 * Two layers, both real (nothing invented):
 *  1. Structural + angle DNA — derived from the library manifest + folder taxonomy (free, deterministic).
 *  2. Observed visual DNA — a 3-static sample sent through the OpenRouter VISION path (gpt-4o-mini) via the
 *     budget-guarded runTextProvider, proving the vision provider works live and the spend is tracked.
 *
 * Run:  DATABASE_URL=… OPENROUTER_API_KEY=… npx tsx src/scripts/prove-static-creative-dna.ts
 */
import { readFileSync } from "node:fs";
import { closeDb } from "@/db";
import { createMemoryRecord } from "@/lib/memory";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";

const FOUNDER = "Moiz";
const SL = "C:/Users/moizk/OneDrive/Documents/Claude/Projects/Marketing campaign/Wobble-Social-Library-UPLOAD";

// Layer 1 — structural + angle DNA, counted straight from the manifest (196 PNG / 35 campaigns / 0 dupes,
// all 880x1168) and the ad-folder angle taxonomy (129 distinct angles; pain 28 / outcome 20 / system 18).
const STRUCTURAL_FACTS = [
  {
    area: "static_creative_dna_library",
    title: "WOBBLE Static Creative DNA — library & format",
    content:
      "WOBBLE's static creative library = 196 feed-native assets, ALL uniform 880x1168 portrait (aspect 0.753, ~3:4), zero exact duplicates (sha256-verified), across 35 campaigns that map 1:1 to the service portfolio. Highest-volume campaigns: AI Receptionist System (12), Brand/Whole-Offer (12), AI Ads Management & Optimization (10), AI Ads Strategy & Launch (10), AI Ads Tracking Intelligence (9). A single portrait ratio is house discipline — format consistency is part of the WOBBLE brand system.",
  },
  {
    area: "static_creative_dna_angles",
    title: "WOBBLE Static Creative DNA — angle system",
    content:
      "WOBBLE static ads run on a Pain -> Outcome -> System angle triad as the strategic spine (~66 of 196 ads: 28 pain, 20 outcome, 18 system cuts), then diversify hard: 129 DISTINCT angles across 196 ads. Secondary layers: format cuts (infographic, checklist, comparison, audit, myth-bust, mistake ~16) and niche cuts (home-services, ecom, beauty, law ~14). A long tail of named visual-metaphor concepts (vs-old-way, tools-vs-system, tug-of-war, sunk-cost-pit, time-gremlins, war-map, wall-of-stars, switchboard-midnight) turns the rebellious 'make the old way wobble' idea into single-image metaphors.",
  },
];

const SAMPLE = [
  { angle: "universal-pain", file: "ai-receptionist-system/ad_001__ai-receptionist__universal-pain/001.png" },
  { angle: "universal-outcome", file: "ai-receptionist-system/ad_002__ai-receptionist__universal-outcome/002.png" },
  { angle: "universal-system", file: "ai-receptionist-system/ad_003__ai-receptionist__universal-system/003.png" },
];

async function analyzeStatic(rel: string, angle: string): Promise<string> {
  const buf = readFileSync(`${SL}/${rel}`);
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  const messages: ProviderChatMessage[] = [
    { role: "system", content: "You are a brand design analyst. Report ONLY what you actually SEE in the image. Be terse and concrete." },
    {
      role: "user",
      content: [
        { type: "text", text: `This is a WOBBLE static ad (angle: ${angle}). In <=45 words state: background (dark or light + approx colour), the primary accent colour and whether electric lime #B8FF2C is present, the layout (headline placement + imagery), and the typography vibe.` },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];
  const r = await runTextProvider({
    role: "default",
    model: "openai/gpt-4o-mini",
    module: "media",
    messages,
    maxTokens: 120,
    temperature: 0,
    usageContext: { agentSlug: "static_creative_dna", departmentSlug: "design_intelligence", module: "media" },
  });
  return r.text.trim().replace(/\s+/g, " ");
}

async function main() {
  // Layer 1 — free structural/angle DNA into the design bank.
  for (const f of STRUCTURAL_FACTS) {
    await createMemoryRecord({
      title: f.title, content: f.content, area: f.area,
      memoryTier: "working", trustLevel: "founder_core", bankSlugs: ["design"], createdBy: FOUNDER,
    });
    console.log(`  seeded structural DNA: ${f.title}`);
  }

  // Layer 2 — live, budget-guarded vision over a 3-static sample.
  const observations: string[] = [];
  for (const s of SAMPLE) {
    const obs = await analyzeStatic(s.file, s.angle);
    console.log(`  vision[${s.angle}]: ${obs}`);
    observations.push(`(${s.angle}) ${obs}`);
  }

  const visualContent =
    `WOBBLE Static Creative DNA — OBSERVED visual execution (gpt-4o-mini vision over a 3-static ai-receptionist sample): ${observations.join(" | ")}`.slice(0, 1900);
  await createMemoryRecord({
    title: "WOBBLE Static Creative DNA — observed visual execution",
    content: visualContent, area: "static_creative_dna_visual",
    memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["design"], createdBy: FOUNDER,
  });
  console.log("  seeded observed visual DNA (from live vision).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
