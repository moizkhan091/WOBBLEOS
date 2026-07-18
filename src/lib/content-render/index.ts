import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, type ProviderBudgetDeps } from "@/lib/provider-budget";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { openrouterMediaProvider } from "@/lib/media/openrouter-provider";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildRenderPlan, HERO_IMAGE_MODEL, BRAND_REFERENCE_DIR, WOBBLE_REFERENCE_EXEMPLARS, type RenderKind, type CarouselSlideInput, type RenderTreatment } from "@/lib/domain/content-render";

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
