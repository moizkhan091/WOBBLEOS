import { describe, expect, it, vi } from "vitest";
import {
  buildStaticImagePrompt,
  buildCarouselSlidePrompts,
  buildRenderPlan,
  WOBBLE_VISUAL_SYSTEM,
  WOBBLE_REFERENCE_EXEMPLARS,
  HERO_IMAGE_MODEL,
  VOLUME_IMAGE_MODEL,
} from "@/lib/domain/content-render";
import { renderContent, type RenderMediaProvider } from "@/lib/content-render";
import { extractOpenRouterImageDataUrls, createOpenRouterMediaProvider } from "@/lib/media/openrouter-provider";

/**
 * Content rendering — on-brand statics/carousels. The prompt is the product: it must carry the WOBBLE visual
 * system + the exact copy so the model renders a finished on-brand asset. The service is governed (blocked
 * without a key, budget-gated) and passes reference images through for image→image.
 */
describe("render prompt builders (on-brand)", () => {
  it("a static prompt carries the brand system, the exact hook text, and the platform aspect", () => {
    const p = buildStaticImagePrompt({ hook: "Stop renting your growth from agencies", teachingJob: "missed-call text-back in n8n", pillar: "buildable_automations", platform: "instagram" });
    expect(p).toContain(WOBBLE_VISUAL_SYSTEM);
    expect(p).toContain('"Stop renting your growth from agencies"'); // exact copy to render
    expect(p).toContain("#B8FF2C"); // the lime accent is specified
    expect(p).toContain("4:5"); // instagram aspect
    expect(p.toLowerCase()).toContain("wobble");
  });

  it("a carousel builds one cohesive prompt per slide with cover + cta roles", () => {
    const prompts = buildCarouselSlidePrompts({
      hook: "The 4-node WhatsApp recovery loop",
      slides: [{ heading: "Cover" }, { heading: "The problem", body: "31% of leads go cold" }, { heading: "Book a call", role: "cta" }],
      cta: "Book a free AI audit",
      platform: "instagram",
    });
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain("COVER");
    expect(prompts[0]).toContain('"The 4-node WhatsApp recovery loop"');
    expect(prompts[2]).toContain("CTA");
    expect(prompts[2]).toContain("Book a free AI audit");
    for (const p of prompts) expect(p).toContain(WOBBLE_VISUAL_SYSTEM); // cohesive set
  });

  it("a rich static prompt commits to a treatment, colours the accent phrase, and builds the metaphor", () => {
    const p = buildStaticImagePrompt({
      hook: "Stop renting your growth from agencies",
      accentPhrase: "renting",
      accentColor: "electric orange",
      treatment: "cinematic_3d",
      metaphor: "a giant magnet labelled AGENCY pulling clay storefronts",
      teachingJob: "you own nothing if growth is rented",
      labelTag: "FOR SMB FOUNDERS",
      cta: "Book a free AI audit",
    });
    expect(p).toContain("CINEMATIC 3D RENDER");
    expect(p).toContain('phrase "renting" in electric orange');
    expect(p).toContain("giant magnet labelled AGENCY");
    expect(p).toContain("FOR SMB FOUNDERS");
    expect(p).toContain("Book a free AI audit");
    expect(p).toContain("STUDY THE ATTACHED REFERENCE IMAGES");
  });

  it("every treatment has at least one bundled reference exemplar", () => {
    for (const t of ["cinematic_3d", "photographic_dataviz", "hand_notebook"] as const) {
      expect(WOBBLE_REFERENCE_EXEMPLARS[t].length).toBeGreaterThan(0);
    }
  });

  it("buildRenderPlan defaults static→hero model, carousel→volume model, one item per slide", () => {
    const st = buildRenderPlan({ kind: "static", hook: "H", teachingJob: "T" });
    expect(st.model).toBe(HERO_IMAGE_MODEL);
    expect(st.items).toHaveLength(1);
    const car = buildRenderPlan({ kind: "carousel", hook: "H", teachingJob: "T", slides: [{ heading: "a" }, { heading: "b" }] });
    expect(car.model).toBe(VOLUME_IMAGE_MODEL);
    expect(car.items).toHaveLength(2);
  });
});

describe("render service (governed)", () => {
  const okProvider = (calls: Array<{ prompt: string; params: Record<string, unknown> }>): RenderMediaProvider => ({
    configured: () => true,
    async generate({ prompt, params }) {
      calls.push({ prompt, params });
      return { outputRefs: ["media/abc123.png"], actualCostCents: 4 };
    },
  });
  const budget = { getSpent: async () => 0 };

  it("is BLOCKED (never faked) when the provider is unconfigured", async () => {
    const provider: RenderMediaProvider = { configured: () => false, generate: async () => ({ outputRefs: [] }) };
    await expect(renderContent({ kind: "static", hook: "H", teachingJob: "T", requestedBy: "moiz" }, { provider, loadKillSwitches: async () => [], budgetDeps: budget })).rejects.toThrow(/not configured/);
  });

  it("renders a static (hero model) and records the asset + cost", async () => {
    const calls: Array<{ prompt: string; params: Record<string, unknown> }> = [];
    const res = await renderContent({ kind: "static", hook: "Stop renting your growth", teachingJob: "text-back flow", topicId: "topic_1", referenceImages: [], requestedBy: "moiz" }, { provider: okProvider(calls), loadKillSwitches: async () => [], recordAudit: async () => {}, budgetDeps: budget });
    expect(res.kind).toBe("static");
    expect(res.model).toBe(HERO_IMAGE_MODEL);
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].outputRefs).toEqual(["media/abc123.png"]);
    expect(res.totalCostCents).toBe(4);
    expect(calls[0].params.model).toBe(HERO_IMAGE_MODEL);
  });

  it("renders one image per carousel slide and passes reference images through", async () => {
    const calls: Array<{ prompt: string; params: Record<string, unknown> }> = [];
    const ref = "data:image/png;base64,AAAA";
    const res = await renderContent(
      { kind: "carousel", hook: "Hook", teachingJob: "T", slides: [{ heading: "a" }, { heading: "b" }, { heading: "cta", role: "cta" }], referenceImages: [ref], requestedBy: "moiz" },
      { provider: okProvider(calls), loadKillSwitches: async () => [], recordAudit: async () => {}, budgetDeps: budget },
    );
    expect(res.assets).toHaveLength(3);
    expect(calls.every((c) => Array.isArray(c.params.referenceImages) && (c.params.referenceImages as string[])[0] === ref)).toBe(true);
  });

  it("respects the slide cap (spend guard)", async () => {
    const calls: Array<{ prompt: string; params: Record<string, unknown> }> = [];
    const slides = Array.from({ length: 20 }, (_, i) => ({ heading: `s${i}` }));
    const res = await renderContent({ kind: "carousel", hook: "H", teachingJob: "T", slides, referenceImages: [], requestedBy: "moiz" }, { provider: okProvider(calls), loadKillSwitches: async () => [], recordAudit: async () => {}, budgetDeps: budget, maxSlides: 5 });
    expect(res.assets).toHaveLength(5); // capped
  });
});

describe("openrouter adapter reference-image transport", () => {
  it("builds multimodal content (text + image_url) when reference images are provided", async () => {
    let sentBody: Record<string, unknown> = {};
    const transport = vi.fn(async (_url: string, init: { body: string }) => {
      sentBody = JSON.parse(init.body);
      return { status: 200, json: { choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AAA" } }] } }], usage: { cost: 0.04 } } };
    });
    const provider = createOpenRouterMediaProvider({ transport: transport as never, apiKey: "k", storageRoot: process.env.TEMP ?? "." });
    await provider.generate({ kind: "image", prompt: "make it", params: { model: HERO_IMAGE_MODEL, referenceImages: ["data:image/png;base64,REF", "https://evil/skip"] } }).catch(() => undefined);
    const content = (sentBody.messages as Array<{ content: unknown }>)[0].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe("text");
    // only the data: URL is included; the http URL is dropped (no SSRF/remote fetch)
    const imageParts = content.filter((c) => c.type === "image_url");
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0].image_url?.url).toBe("data:image/png;base64,REF");
    expect(sentBody.model).toBe(HERO_IMAGE_MODEL);
  });

  it("extractOpenRouterImageDataUrls still pulls inline images", () => {
    const urls = extractOpenRouterImageDataUrls({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,ZZ" } }] } }] });
    expect(urls).toEqual(["data:image/png;base64,ZZ"]);
  });
});
