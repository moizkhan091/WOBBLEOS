import { newId } from "@/lib/ids";

/**
 * Content rendering — the pure core. Turns an approved topic / content packet into image-generation PROMPTS
 * for GPT-Image-2 (or gemini) that render statics + carousels which stand out and stay ruthlessly on-brand.
 * The prompt is where "ultimate best brand, best visually" lives: it encodes the WOBBLE visual system + the
 * exact text to render + the teaching mechanism, so the model renders a finished, on-brand asset — not a
 * generic AI picture. Provider-free + unit-tested.
 */

// The WOBBLE / Moiz Khan creative system, reverse-engineered from the real 196-asset library + LinkedIn
// infographics. These are PREMIUM, art-directed, editorial social designs with real craft — NOT flat vector
// graphics. Every prompt is anchored here AND paired with reference images so the model matches the real look.
export const WOBBLE_VISUAL_SYSTEM = `WOBBLE / Moiz Khan creative system — STUDY THE ATTACHED REFERENCE IMAGES and match their craft, energy, and finish exactly. These are top-studio editorial social ads, NOT flat vector graphics, NOT generic minimalism. Non-negotiable rules on EVERY asset:
- ONE bold idea, made unmissable. A HUGE ultra-bold CONDENSED sans-serif headline (Druk / Anton / Archivo Black energy) dominates the top. The single most important phrase is set in ONE saturated ACCENT colour; the rest is heavy near-black. Tight leading, confident, oversized.
- A vivid, TACTILE SCENE that turns the idea into a real physical metaphor — commit fully to ONE of these treatments:
  (A) CINEMATIC 3D RENDER: a dramatic hero object + clay/3D figures acting out the metaphor (e.g. a giant glossy magnet pulling little clay houses & people), on a saturated colour field, cinematic studio lighting, real shadows, depth of field, rich texture.
  (B) REAL-OBJECT PHOTOGRAPHIC DATA-VIZ: real photographed miniature objects arranged into a chart/diagram (e.g. mini shopping carts forming a donut chart) on cream/textured paper, soft daylight, accent-colour segments.
  (C) HAND-DRAWN NOTEBOOK: authentic spiral-notebook / lined paper, black marker hand-lettering, YELLOW highlighter on key phrases, hand-drawn doodle icons, numbered steps — looks genuinely hand-made and smart.
- Background: a saturated single colour (electric orange, deep green, cobalt, crimson) OR cream paper OR notebook paper — high contrast and confident, NEVER a plain flat black slab.
- Supporting line in ITALIC SERIF or handwritten marker. A pill-shaped label tag (like "FOR REALTORS") and/or a pill-shaped CTA button.
- A small "wobble." wordmark or "Follow Moiz Khan on LinkedIn" in a corner.
- The finish must read as expensive, distinctive, scroll-stopping — art-directed by a great studio. Render ALL on-image text crisply and spelled EXACTLY as given.`;

export type RenderPlatform = "instagram" | "linkedin" | "x" | "youtube" | "multi";

/** Aspect guidance per platform (the model renders to the ratio described). */
export const RENDER_ASPECTS: Record<RenderPlatform, string> = {
  instagram: "4:5 vertical portrait (1080x1350), optimised for the feed",
  linkedin: "1:1 square (1200x1200), optimised for the LinkedIn feed",
  x: "16:9 landscape (1600x900)",
  youtube: "16:9 landscape thumbnail (1280x720), oversized readable headline",
  multi: "4:5 vertical portrait (1080x1350)",
};

function aspectFor(platform: string): string {
  return RENDER_ASPECTS[(platform as RenderPlatform)] ?? RENDER_ASPECTS.multi;
}

/** Visual treatments observed in the real library — the prompt commits fully to one. */
export const RENDER_TREATMENTS = ["cinematic_3d", "photographic_dataviz", "hand_notebook"] as const;
export type RenderTreatment = (typeof RENDER_TREATMENTS)[number];

/** Repo-bundled brand reference exemplars (from the real 196-asset library) — auto-fed to the model by
 *  treatment so every render matches the real WOBBLE craft, on dev AND on the VPS (no external dependency). */
export const BRAND_REFERENCE_DIR = "assets/brand-references";
export const WOBBLE_REFERENCE_EXEMPLARS: Record<RenderTreatment, string[]> = {
  cinematic_3d: ["cinematic-magnet.png", "cinematic-speed.png"],
  photographic_dataviz: ["photographic-donut.png"],
  hand_notebook: ["notebook-database.png"],
};

const TREATMENT_BRIEF: Record<RenderTreatment, string> = {
  cinematic_3d:
    "TREATMENT A — CINEMATIC 3D RENDER: build a dramatic hero object + clay/3D figures that act out the metaphor, on a saturated colour field with cinematic studio lighting, real shadows, depth of field and rich texture (like the giant magnet pulling clay houses reference).",
  photographic_dataviz:
    "TREATMENT B — REAL-OBJECT PHOTOGRAPHIC DATA-VIZ: photograph real miniature objects arranged into a chart/diagram on cream textured paper with soft daylight and accent-colour segments (like the mini shopping-carts donut-chart reference).",
  hand_notebook:
    "TREATMENT C — HAND-DRAWN NOTEBOOK: authentic spiral-notebook / lined paper, black marker hand-lettering, YELLOW highlighter on the key phrases, hand-drawn doodle icons and numbered steps (like the 'wake your dead database' reference).",
};

export interface StaticPromptInput {
  hook: string; // the scroll-stopping headline (rendered on-image), exactly as given
  teachingJob: string; // the real mechanism — the basis for the physical metaphor
  pillar?: string;
  platform?: string;
  subhead?: string; // supporting line (italic serif / marker)
  accentPhrase?: string; // the exact words of the hook to set in the accent colour
  accentColor?: string; // e.g. "electric orange", "electric lime", "crimson"
  colorField?: string; // background colour field / paper
  treatment?: RenderTreatment; // which of the three real looks to commit to
  metaphor?: string; // an explicit physical-metaphor scene to build (optional; else the model invents one)
  labelTag?: string; // pill label like "FOR SMB FOUNDERS"
  cta?: string; // pill CTA text
  brandNotes?: string; // extra art-direction from the design DNA bank
}

/** Build a rich, art-directed GPT-Image-2 prompt for a single premium on-brand static. Pair with reference images. */
export function buildStaticImagePrompt(input: StaticPromptInput): string {
  const treatment = input.treatment ?? "cinematic_3d";
  const accent = input.accentColor ?? "electric lime (#B8FF2C)";
  return [
    `Art-direct and render a PREMIUM, scroll-stopping social STATIC for the WOBBLE brand in ${aspectFor(input.platform ?? "multi")}. Match the craft and finish of the attached reference images.`,
    ``,
    WOBBLE_VISUAL_SYSTEM,
    input.brandNotes ? `\nExtra art-direction from WOBBLE's design DNA: ${input.brandNotes}` : ``,
    ``,
    `THIS ASSET:`,
    TREATMENT_BRIEF[treatment],
    `- THE PHYSICAL METAPHOR (this is the whole image — make it clever, literal and dramatic): ${input.metaphor ?? `invent a striking real-world physical metaphor that makes this idea instantly obvious and memorable — ${input.teachingJob}`}`,
    `- HEADLINE (render this EXACT text, huge, ultra-bold condensed, dominating the top): "${input.hook}"`,
    input.accentPhrase ? `- Set ONLY the phrase "${input.accentPhrase}" in ${accent}; the rest of the headline heavy near-black.` : `- Put ${accent} on the single most important word of the headline; the rest heavy near-black.`,
    input.subhead ? `- Supporting line (italic serif or handwritten marker, smaller): "${input.subhead}"` : ``,
    input.colorField ? `- Background colour field: ${input.colorField}.` : `- Choose a saturated, confident background colour field that suits the metaphor (never a plain flat black slab).`,
    input.labelTag ? `- A pill-shaped label tag reading "${input.labelTag}" top-left.` : ``,
    input.cta ? `- A pill-shaped CTA button reading "${input.cta}".` : ``,
    input.pillar ? `- Editorial tone: a "${input.pillar.replace(/_/g, " ")}" piece.` : ``,
    `- A small "wobble." wordmark in a lower corner.`,
    ``,
    `Output ONE finished, ready-to-post image. Expensive, distinctive, art-directed — it must stop the scroll and look unmistakably like the WOBBLE references. All text crisp and spelled exactly as given.`,
  ]
    .filter((l) => l !== ``)
    .join("\n");
}

export const CAROUSEL_SLIDE_ROLES = ["cover", "problem", "mechanism", "proof", "cta"] as const;
export type CarouselSlideRole = (typeof CAROUSEL_SLIDE_ROLES)[number];

export interface CarouselSlideInput {
  heading: string;
  body?: string;
  role?: CarouselSlideRole;
}

export interface CarouselPromptInput {
  hook: string;
  slides: CarouselSlideInput[];
  pillar?: string;
  platform?: string;
  cta?: string;
  brandNotes?: string;
}

/**
 * Build one prompt per carousel slide, all sharing the SAME visual system so the deck is cohesive (a viewer
 * swiping feels one designed set). Slide 1 is the hook cover; the rest carry the teaching, ending on a soft CTA.
 */
export function buildCarouselSlidePrompts(input: CarouselPromptInput): string[] {
  const aspect = aspectFor(input.platform ?? "multi");
  const total = input.slides.length;
  return input.slides.map((slide, i) => {
    const roleLabel = slide.role ?? (i === 0 ? "cover" : i === total - 1 ? "cta" : "mechanism");
    return [
      `Design carousel SLIDE ${i + 1} of ${total} for the WOBBLE brand in ${aspect}. This is the "${roleLabel}" slide — it MUST look like part of the same designed set as the other slides (same palette, type system, grid).`,
      ``,
      WOBBLE_VISUAL_SYSTEM,
      input.brandNotes ? `\nAdditional brand art-direction: ${input.brandNotes}` : ``,
      ``,
      i === 0
        ? `SLIDE ROLE — COVER: a bold hook cover. Render this exact headline huge: "${input.hook}". Add a small "swipe →" affordance and the "wobble." wordmark.`
        : roleLabel === "cta"
          ? `SLIDE ROLE — CTA: a clean close. Render: "${slide.heading}"${slide.body ? ` and below it: "${slide.body}"` : ``}. One soft call to action${input.cta ? `: "${input.cta}"` : ` (e.g. "Book a free AI audit")`}. Lime accent on the CTA.`
          : `SLIDE ROLE — ${roleLabel.toUpperCase()}: render heading "${slide.heading}"${slide.body ? ` with supporting text "${slide.body}"` : ``}. Use a simple editorial graphic (icon / node-arrow flow / highlighted number) so the point is instantly clear. Keep text concise and correctly spelled.`,
      ``,
      `Output a single finished slide image, premium and distinctive, unmistakably WOBBLE.`,
    ]
      .filter((l) => l !== ``)
      .join("\n");
  });
}

export type RenderKind = "static" | "carousel";

export interface RenderPlanItem {
  slideIndex: number;
  role: string;
  prompt: string;
}
export interface RenderPlan {
  renderId: string;
  kind: RenderKind;
  model: string;
  items: RenderPlanItem[];
}

/** The default image model. GPT-Image-2 (via OpenRouter) for hero quality; gemini for cheap volume. */
export const HERO_IMAGE_MODEL = "openai/gpt-5.4-image-2";
export const VOLUME_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export interface BuildRenderPlanInput {
  kind: RenderKind;
  hook: string;
  teachingJob: string;
  pillar?: string;
  platform?: string;
  slides?: CarouselSlideInput[];
  cta?: string;
  brandNotes?: string;
  model?: string;
  // rich art-direction (statics) — see StaticPromptInput
  accentPhrase?: string;
  accentColor?: string;
  colorField?: string;
  treatment?: RenderTreatment;
  metaphor?: string;
  labelTag?: string;
  subhead?: string;
}

/** Assemble the full render plan (one prompt for a static, N for a carousel) with the chosen model. */
export function buildRenderPlan(input: BuildRenderPlanInput, opts: { id?: string } = {}): RenderPlan {
  const model = input.model ?? (input.kind === "static" ? HERO_IMAGE_MODEL : VOLUME_IMAGE_MODEL);
  if (input.kind === "carousel") {
    const slides = input.slides?.length ? input.slides : [{ heading: input.hook, role: "cover" as const }];
    const prompts = buildCarouselSlidePrompts({ hook: input.hook, slides, pillar: input.pillar, platform: input.platform, cta: input.cta, brandNotes: input.brandNotes });
    return { renderId: opts.id ?? newId("render"), kind: "carousel", model, items: prompts.map((prompt, i) => ({ slideIndex: i, role: slides[i]?.role ?? (i === 0 ? "cover" : "mechanism"), prompt })) };
  }
  const prompt = buildStaticImagePrompt({
    hook: input.hook,
    teachingJob: input.teachingJob,
    pillar: input.pillar,
    platform: input.platform,
    subhead: input.subhead ?? input.slides?.[0]?.body,
    accentPhrase: input.accentPhrase,
    accentColor: input.accentColor,
    colorField: input.colorField,
    treatment: input.treatment,
    metaphor: input.metaphor,
    labelTag: input.labelTag,
    cta: input.cta,
    brandNotes: input.brandNotes,
  });
  return { renderId: opts.id ?? newId("render"), kind: "static", model, items: [{ slideIndex: 0, role: "static", prompt }] };
}
