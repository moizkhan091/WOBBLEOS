import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, type ProviderBudgetDeps } from "@/lib/provider-budget";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { openrouterMediaProvider } from "@/lib/media/openrouter-provider";
import { buildRenderPlan, HERO_IMAGE_MODEL, type RenderKind, type CarouselSlideInput } from "@/lib/domain/content-render";

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
  /** reference images as data: URLs — guide the style / enable image→image regen. */
  referenceImages?: string[];
  topicId?: string;
  requestedBy: string;
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

  const budgetDeps = deps.budgetDeps ?? {};
  const assets: RenderedAsset[] = [];
  let totalCents = 0;
  for (const item of items) {
    // Budget gate BEFORE the paid image call — image spend counts against the OpenRouter allowance.
    await assertProviderAllowance(IMAGE_PROVIDER, worst, budgetDeps);
    const ledgerItem = `content-render:${plan.kind}:${input.topicId ?? plan.renderId}:${item.slideIndex}`;
    const started = Date.now();
    try {
      const r = await provider.generate({ kind: "image", prompt: item.prompt, params: { model: plan.model, referenceImages: input.referenceImages ?? [] } });
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
