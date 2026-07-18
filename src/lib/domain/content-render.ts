import { newId } from "@/lib/ids";

/**
 * Content rendering — the pure core. Turns an approved topic / content packet into image-generation PROMPTS
 * for GPT-Image-2 (or gemini) that render statics + carousels which stand out and stay ruthlessly on-brand.
 * The prompt is where "ultimate best brand, best visually" lives: it encodes the WOBBLE visual system + the
 * exact text to render + the teaching mechanism, so the model renders a finished, on-brand asset — not a
 * generic AI picture. Provider-free + unit-tested.
 */

// The WOBBLE visual system (from docs/WOBBLE_COMPANY_OS.md). Every prompt is anchored to this so the whole
// slate looks like ONE brand: editorial, high-contrast, rebellious, unmistakably WOBBLE.
export const WOBBLE_VISUAL_SYSTEM = `WOBBLE brand visual system — follow EXACTLY:
- Palette: near-black background (#06070A / #0A0B0F), crisp white (#F2F4F1) text, ONE electric-lime accent (#B8FF2C) used sparingly for emphasis (a keyword, an underline, an arrow, a highlight box). No other colours except muted grey (#7a7f74) for secondary text.
- Typography: bold, heavy, condensed geometric sans-serif (Neue-Haas / Helvetica-Now / Archivo energy). Massive headline, tight leading, high contrast in weight between the hook and the body. NEVER thin/elegant/serif.
- Layout: clean editorial grid, generous negative space, strong left alignment or a centred hero. One dominant focal point. Deliberate, premium, not busy.
- Mood: rebellious, fast, intelligent, confident — an anti-agency challenger brand for Pakistan-first SMB founders. Feels like a sharp tech-founder's slide, not a stock template.
- Motifs (subtle, optional): thin lime grid lines, a small node-and-arrow automation diagram, a monospace label, a tiny "wobble." wordmark lower-corner. Flat vector / editorial infographic style — NOT photorealistic, NOT 3D-render, NOT clip-art.
- Render the on-image TEXT crisply and correctly, spelled exactly as given, with clear hierarchy.`;

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

export interface StaticPromptInput {
  hook: string; // the scroll-stopping headline (rendered on-image)
  teachingJob: string; // the real mechanism to convey visually
  pillar?: string;
  platform?: string;
  subhead?: string; // optional supporting line
  brandNotes?: string; // extra art-direction from the design DNA bank
}

/** Build a rich, structured GPT-Image-2 prompt for a single on-brand static. */
export function buildStaticImagePrompt(input: StaticPromptInput): string {
  return [
    `Design a premium social STATIC for the WOBBLE brand in ${aspectFor(input.platform ?? "multi")}.`,
    ``,
    WOBBLE_VISUAL_SYSTEM,
    input.brandNotes ? `\nAdditional brand art-direction: ${input.brandNotes}` : ``,
    ``,
    `THE ASSET:`,
    `- Dominant headline (render this exact text, large and bold): "${input.hook}"`,
    input.subhead ? `- Supporting line (smaller, muted): "${input.subhead}"` : ``,
    `- Visual concept: convey this teaching idea simply and cleverly with editorial graphics (icons, a small node-and-arrow flow, a highlighted keyword) — do NOT just decorate: the visual should make the idea instantly graspable. Teaching idea: ${input.teachingJob}`,
    input.pillar ? `- Editorial tone for a "${input.pillar.replace(/_/g, " ")}" piece.` : ``,
    `- Use the electric-lime accent on ONE focal word or element only.`,
    `- Add a tiny "wobble." wordmark in a lower corner.`,
    ``,
    `Output a single finished, ready-to-post image. Crisp correctly-spelled text, premium and distinctive — it must stand out in a busy feed and look unmistakably WOBBLE.`,
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
}

/** Assemble the full render plan (one prompt for a static, N for a carousel) with the chosen model. */
export function buildRenderPlan(input: BuildRenderPlanInput, opts: { id?: string } = {}): RenderPlan {
  const model = input.model ?? (input.kind === "static" ? HERO_IMAGE_MODEL : VOLUME_IMAGE_MODEL);
  if (input.kind === "carousel") {
    const slides = input.slides?.length ? input.slides : [{ heading: input.hook, role: "cover" as const }];
    const prompts = buildCarouselSlidePrompts({ hook: input.hook, slides, pillar: input.pillar, platform: input.platform, cta: input.cta, brandNotes: input.brandNotes });
    return { renderId: opts.id ?? newId("render"), kind: "carousel", model, items: prompts.map((prompt, i) => ({ slideIndex: i, role: slides[i]?.role ?? (i === 0 ? "cover" : "mechanism"), prompt })) };
  }
  const prompt = buildStaticImagePrompt({ hook: input.hook, teachingJob: input.teachingJob, pillar: input.pillar, platform: input.platform, subhead: input.slides?.[0]?.body, brandNotes: input.brandNotes });
  return { renderId: opts.id ?? newId("render"), kind: "static", model, items: [{ slideIndex: 0, role: "static", prompt }] };
}
