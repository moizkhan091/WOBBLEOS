/**
 * LIVE proof: render a real on-brand WOBBLE static via the OpenRouter image adapter (gemini cheap + GPT-Image-2
 * hero). Confirms a real image file is produced + budget recorded.
 *   DATABASE_URL=… OPENROUTER_API_KEY=… STORAGE_ROOT=… npx tsx src/scripts/prove-content-render.ts
 */
import path from "node:path";
import { renderContent } from "@/lib/content-render";
import { VOLUME_IMAGE_MODEL, HERO_IMAGE_MODEL } from "@/lib/domain/content-render";

async function main() {
  const root = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const base = { hook: "Stop renting your growth from agencies", teachingJob: "A 4-node n8n automation: missed-call webhook → AI text-back → booking link → CRM log; show the nodes connected by arrows.", pillar: "buildable_automations", platform: "instagram", requestedBy: "prove-content-render" } as const;

  const which = process.env.RENDER_MODEL === "hero" ? [{ tag: "GPT-IMAGE-2", model: HERO_IMAGE_MODEL }] : process.env.RENDER_MODEL === "both" ? [{ tag: "GEMINI", model: VOLUME_IMAGE_MODEL }, { tag: "GPT-IMAGE-2", model: HERO_IMAGE_MODEL }] : [{ tag: "GEMINI", model: VOLUME_IMAGE_MODEL }];

  for (const { tag, model } of which) {
    console.log(`[render] ${tag} (${model}) …`);
    try {
      const r = await renderContent({ ...base, kind: "static", model, topicId: `prove-${tag}` }, {});
      for (const a of r.assets) console.log(`  ${tag} → ${a.outputRefs.map((ref) => path.join(root, ref)).join(", ")} | cost ${a.costCents}¢`);
    } catch (e) {
      console.log(`  ${tag} FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
