import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, type ProviderBudgetDeps } from "@/lib/provider-budget";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { openrouterMediaProvider } from "@/lib/media/openrouter-provider";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { buildRenderPlan, buildArtDirectorPrompt, parseRenderConcept, HERO_IMAGE_MODEL, BRAND_REFERENCE_DIR, WOBBLE_REFERENCE_EXEMPLARS, type RenderKind, type CarouselSlideInput, type RenderTreatment, type RenderConcept } from "@/lib/domain/content-render";

/**
 * Content render service — turns a topic/packet into on-brand statics/carousels via the OpenRouter image
 * adapter (GPT-Image-2 for heroes, gemini for volume), governed by the provider budget so image spend is
 * capped + recorded against the OpenRouter allowance. Blocked (never faked) without a key. Provider + audit
 * injectable for tests.
 */

export const CONTENT_RENDER_MODULE = "content";
export const IMAGE_PROVIDER = "openrouter";

/** Pessimistic worst-case USD per image — GPT-Image-2 costs more than gemini; gates cumulative spend. */
function worstCasePerImage(model: string): number {
  return model === HERO_IMAGE_MODEL ? 0.2 : 0.05;
}

export interface RenderMediaProvider {
  configured(): boolean;
  generate(input: { kind: "image"; prompt: string; params: Record<string, unknown> }): Promise<{ outputRefs: string[]; actualCostCents?: number }>;
}

export interface ContentRenderDeps {
  provider?: RenderMediaProvider;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  loadKillSwitches?: () => Promise<Awaited<ReturnType<typeof loadEngagedSwitches>>>;
  /** budget reader/writer deps (inject getSpent in tests so no DB is needed). */
  budgetDeps?: ProviderBudgetDeps;
  /** cap on slides rendered per carousel (spend guard). */
  maxSlides?: number;
}

export interface RenderContentInput {
  kind: RenderKind;
  hook: string;
  teachingJob: string;
  pillar?: string;
  platform?: string;
  slides?: CarouselSlideInput[];
  cta?: string;
  brandNotes?: string;
  model?: string;
  // rich art-direction (statics)
  accentPhrase?: string;
  accentColor?: string;
  colorField?: string;
  treatment?: RenderTreatment;
  metaphor?: string;
  subject?: string;
  light?: string;
  camera?: string;
  grade?: string;
  texture?: string;
  mood?: string;
  labelTag?: string;
  subhead?: string;
  /** reference images as data: URLs — guide the style / enable image→image regen. */
  referenceImages?: string[];
  topicId?: string;
  requestedBy: string;
}

const REF_EXT_CT: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** Read image files (WOBBLE reference statics) → data: URLs for GPT-Image-2 style reference. Missing files skipped. */
export async function loadReferenceImages(paths: string[], maxEach = 4_000_000): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    try {
      const bytes = await fs.readFile(p);
      if (!bytes.byteLength || bytes.byteLength > maxEach) continue;
      const ext = p.slice(p.lastIndexOf(".")).toLowerCase();
      const ct = REF_EXT_CT[ext] ?? "image/png";
      out.push(`data:${ct};base64,${bytes.toString("base64")}`);
    } catch {
      /* missing reference — skip, never fail the render */
    }
  }
  return out;
}

export interface RenderedAsset {
  slideIndex: number;
  role: string;
  outputRefs: string[];
  costCents: number;
}
export interface RenderContentResult {
  renderId: string;
  kind: RenderKind;
  model: string;
  assets: RenderedAsset[];
  totalCostCents: number;
}

async function audit(deps: ContentRenderDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Render a topic/packet into on-brand image assets. Statics = 1 image; carousels = one image per slide. */
export async function renderContent(input: RenderContentInput, deps: ContentRenderDeps = {}): Promise<RenderContentResult> {
  const provider = deps.provider ?? openrouterMediaProvider;
  if (!provider.configured()) throw new Error("image provider not configured (OPENROUTER_API_KEY) — rendering is blocked, never faked");

  const switches = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", IMAGE_PROVIDER);

  const plan = buildRenderPlan(input);
  const maxSlides = Math.max(1, Math.min(deps.maxSlides ?? 10, 12));
  const items = plan.items.slice(0, maxSlides);
  const worst = worstCasePerImage(plan.model);

  // Auto-feed the repo-bundled WOBBLE reference exemplars for the treatment (unless the caller supplied their
  // own references) — this is what makes the output match the real brand craft instead of generic AI art.
  let refs = input.referenceImages;
  if (refs === undefined) {
    const root = process.env.WOBBLE_BRAND_REF_ROOT ?? process.cwd();
    const files = (WOBBLE_REFERENCE_EXEMPLARS[input.treatment ?? "cinematic_3d"] ?? []).map((f) => path.join(root, BRAND_REFERENCE_DIR, f));
    refs = await loadReferenceImages(files);
  }

  const budgetDeps = deps.budgetDeps ?? {};
  const assets: RenderedAsset[] = [];
  let totalCents = 0;
  for (const item of items) {
    // Budget gate BEFORE the paid image call — image spend counts against the OpenRouter allowance.
    await assertProviderAllowance(IMAGE_PROVIDER, worst, budgetDeps);
    const ledgerItem = `content-render:${plan.kind}:${input.topicId ?? plan.renderId}:${item.slideIndex}`;
    const started = Date.now();
    try {
      const r = await provider.generate({ kind: "image", prompt: item.prompt, params: { model: plan.model, referenceImages: refs ?? [] } });
      const cents = r.actualCostCents ?? 0;
      totalCents += cents;
      assets.push({ slideIndex: item.slideIndex, role: item.role, outputRefs: r.outputRefs, costCents: cents });
      await recordExternalSpend({ provider: IMAGE_PROVIDER, item: ledgerItem, model: plan.model, estimatedMaxCost: worst, actualCost: cents / 100, unit: "usd", latencyMs: Date.now() - started, result: "succeeded", actor: input.requestedBy, metadata: { role: item.role, outputs: r.outputRefs.length } }, budgetDeps).catch(() => {});
    } catch (err) {
      await recordExternalSpend({ provider: IMAGE_PROVIDER, item: ledgerItem, model: plan.model, estimatedMaxCost: worst, actualCost: 0, unit: "usd", latencyMs: Date.now() - started, result: "failed", actor: input.requestedBy, metadata: { error: err instanceof Error ? err.message : String(err) } }, budgetDeps).catch(() => {});
      throw err;
    }
  }

  await audit(deps, { eventType: "content_render.completed", module: CONTENT_RENDER_MODULE, entityType: "content_topic", entityId: input.topicId ?? plan.renderId, actor: input.requestedBy, metadata: { kind: plan.kind, model: plan.model, images: assets.length, costCents: totalCents } });
  return { renderId: plan.renderId, kind: plan.kind, model: plan.model, assets, totalCostCents: totalCents };
}

// ── Art director → render (the autonomous "produce a great asset from a topic" path) ──────────────────

export type ConceptProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

/** Given a topic, ask the ART DIRECTOR to design a scroll-stopping concept (treatment + metaphor + accent). */
export async function designRenderConcept(
  input: { hook: string; teachingJob: string; pillar?: string; platform?: string },
  deps: { runProvider?: ConceptProvider; model?: string } = {},
): Promise<RenderConcept> {
  const { system, user } = buildArtDirectorPrompt(input);
  const runProvider = deps.runProvider ?? (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: "content_art_director", module: CONTENT_RENDER_MODULE } }));
  const r = await runProvider({
    role: "content_copywriting",
    module: CONTENT_RENDER_MODULE,
    model: deps.model ?? "anthropic/claude-sonnet-4.5",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 900,
    temperature: 0.7,
  });
  const concept = parseRenderConcept(r.text);
  // Never block a render on a bad parse — fall back to a sensible cinematic concept derived from the topic.
  return (
    concept ?? {
      treatment: "cinematic_3d",
      metaphor: `A dramatic scene built from real clay/3D objects that literally embodies: ${input.teachingJob}.`,
      subject: "tactile clay/3D props with real material and finish",
      light: "a single motivated key light from camera-left ~45°, warm ~4800K, soft quality, gentle bounce fill camera-right, a thin rim separating subject from the field, a soft contact shadow falling right",
      camera: "three-quarter view, ~50mm feel at f4, eye-level, subject sharp with the field falling gently soft; top area kept clean for the headline",
      grade: "filmic tone curve, lifted shadows, rolled-off highlights, true-to-life colour",
      texture: "fine film grain, real material texture, faint dust and micro-imperfections, honest contact shadows",
      mood: "confident, editorial",
      accentPhrase: input.hook.split(" ").slice(0, 2).join(" "),
      accentColor: "electric orange",
      colorField: "saturated electric-orange studio backdrop",
      labelTag: "",
      subhead: "",
      cta: "Book a free AI audit",
    }
  );
}

export interface RenderTopicInput {
  kind: RenderKind;
  hook: string;
  teachingJob: string;
  pillar?: string;
  platform?: string;
  slides?: CarouselSlideInput[];
  model?: string;
  topicId?: string;
  requestedBy: string;
}

/** Autonomous: art-direct a concept from the topic, then render the on-brand asset. This is what "Produce
 *  this" runs — the founder gets a library-grade image without hand-writing a prompt. */
export async function renderTopicAsset(
  input: RenderTopicInput,
  deps: ContentRenderDeps & { conceptProvider?: ConceptProvider; conceptModel?: string; designConcept?: (i: { hook: string; teachingJob: string; pillar?: string; platform?: string }) => Promise<RenderConcept> } = {},
): Promise<RenderContentResult & { concept: RenderConcept }> {
  const design = deps.designConcept ?? ((i) => designRenderConcept(i, { runProvider: deps.conceptProvider, model: deps.conceptModel }));
  const concept = await design({ hook: input.hook, teachingJob: input.teachingJob, pillar: input.pillar, platform: input.platform });
  const result = await renderContent(
    {
      kind: input.kind,
      hook: input.hook,
      teachingJob: input.teachingJob,
      pillar: input.pillar,
      platform: input.platform,
      slides: input.slides,
      model: input.model,
      topicId: input.topicId,
      requestedBy: input.requestedBy,
      treatment: concept.treatment,
      metaphor: concept.metaphor,
      subject: concept.subject || undefined,
      light: concept.light || undefined,
      camera: concept.camera || undefined,
      grade: concept.grade || undefined,
      texture: concept.texture || undefined,
      mood: concept.mood || undefined,
      accentPhrase: concept.accentPhrase,
      accentColor: concept.accentColor,
      colorField: concept.colorField,
      labelTag: concept.labelTag || undefined,
      subhead: concept.subhead || undefined,
      cta: concept.cta || undefined,
    },
    deps,
  );
  return { ...result, concept };
}
