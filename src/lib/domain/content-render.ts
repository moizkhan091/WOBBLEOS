import { z } from "zod";
import { newId } from "@/lib/ids";
import { parseJsonObject } from "@/lib/domain/content-graph";

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
  subject?: string; // hero object(s): material, finish, condition
  light?: string; // physics lighting
  camera?: string; // focal-length feel + aperture + viewpoint + framing
  grade?: string; // film stock / tone curve
  texture?: string; // grain / fibre / imperfection
  mood?: string; // anchor words
  labelTag?: string; // pill label like "FOR SMB FOUNDERS"
  cta?: string; // pill CTA text
  brandNotes?: string; // extra art-direction from the design DNA bank
}

/** Build a decision-dense, art-directed GPT-Image-2 prompt (11-slot method, block-structured) for a premium
 *  on-brand static. Pair with reference images. Physics lighting + camera + grade + texture + EXACT TEXT +
 *  negative list = a directed photograph, not a bland AI poster. */
export function buildStaticImagePrompt(input: StaticPromptInput): string {
  const treatment = input.treatment ?? "cinematic_3d";
  const accent = input.accentColor ?? "electric lime (#B8FF2C)";
  return [
    // block 1 — intent / artifact
    `Art-direct and render a PREMIUM, scroll-stopping WOBBLE social STATIC as a directed PHOTOGRAPH/render (NOT a flat AI poster), ${aspectFor(input.platform ?? "multi")}. STUDY the attached WOBBLE reference images and MATCH their craft, density, lighting and finish. Use each reference only for composition/lighting/finish grammar — NOT for its wording, logo, or subject.`,
    ``,
    WOBBLE_VISUAL_SYSTEM,
    input.brandNotes ? `\nExtra art-direction from WOBBLE's design DNA: ${input.brandNotes}` : ``,
    ``,
    TREATMENT_BRIEF[treatment],
    ``,
    // block 2 — subject / scene
    `SCENE / SET (this IS the image — a clever, literal, dramatic physical metaphor built from real objects): ${input.metaphor ?? `invent a striking real-world physical metaphor that makes this instantly obvious — ${input.teachingJob}`}`,
    input.subject ? `SUBJECT (hero object, exact material/finish/condition): ${input.subject}` : ``,
    // block 3 — light / camera / composition / grade / texture (the realism)
    `LIGHT (physics, not vibe): ${input.light ?? "a single motivated key light with a clear direction and colour temperature, gentle fill, a thin separating rim, and a soft believable contact shadow"}.`,
    `CAMERA: ${input.camera ?? "deliberate framing with a real focal-plane — subject sharp, background falling gently soft; reserve clean space at the top for the headline"}.`,
    `GRADE: ${input.grade ?? "a filmic tone curve — lifted shadows, rolled-off highlights, true-to-life colour"}.`,
    `TEXTURE: ${input.texture ?? "fine film grain, real material texture, dust and micro-imperfections, honest contact shadows — reads photographed, never synthetic"}.`,
    input.mood ? `MOOD: ${input.mood}.` : ``,
    ``,
    // block 4 — the exact copy
    `HEADLINE — EXACT TEXT, render VERBATIM, huge ultra-bold condensed, dominating the top: "${input.hook}"`,
    input.accentPhrase ? `Set ONLY the phrase "${input.accentPhrase}" in ${accent}; the rest of the headline heavy near-black. No other words coloured.` : `Put ${accent} on the single most important word; the rest heavy near-black.`,
    input.subhead ? `Supporting line (italic serif or handwritten marker, smaller) — EXACT TEXT: "${input.subhead}"` : ``,
    input.labelTag ? `A pill-shaped label tag, EXACT TEXT: "${input.labelTag}", top area.` : ``,
    input.cta ? `A pill-shaped CTA button, EXACT TEXT: "${input.cta}".` : ``,
    `A small "wobble." wordmark in a lower corner.`,
    ``,
    // block 5 — constraints + negative list
    `CONSTRAINTS: ${aspectFor(input.platform ?? "multi")}. Background colour field: ${input.colorField ?? "a saturated, confident colour that suits the metaphor (never a plain flat black slab)"}. Render ALL text crisp and spelled EXACTLY as written — no extra words, no duplicate text, no invented labels.`,
    `NEGATIVE (avoid all of): ${RENDER_NEGATIVE_LIST}.`,
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

// ── Art director (auto-design a great concept from a topic) ───────────────────────────────────────────

/** The anti-synthetic negative list — attached to every prompt so the output reads photographed, not AI. */
export const RENDER_NEGATIVE_LIST =
  "neon, glowing, excessive bloom, fake bokeh, dramatic over-lighting, lens flare, generic 3d-render look, cgi sheen, plastic surfaces, waxy texture, over-glossy, over-symmetry, oversaturation, muddy grey wash, warped or duplicate text, garbled letters, extra invented words, distorted logo, watermark, busy cluttered background, sparse empty AI-poster feel";

// The art director now fills a full 11-slot art-direction spec (from the creative playbooks) so the prompt is
// decision-dense — physics lighting, camera/lens, grade, texture — not a bland description. Every slot is a
// real decision a photographer/gaffer/colourist would make.
export const renderConceptSchema = z.object({
  treatment: z.enum(RENDER_TREATMENTS),
  metaphor: z.string().trim().min(1), // the SCENE: a vivid, literal physical-metaphor set built from real objects
  subject: z.string().trim().default(""), // the hero object(s): exact material, finish, condition
  light: z.string().trim().default(""), // PHYSICS: source, direction/angle, Kelvin, hard/soft, fill, rim, the shadow it casts
  camera: z.string().trim().default(""), // focal-length feel + aperture/depth + viewpoint + height + framing
  grade: z.string().trim().default(""), // film stock / tone curve (lifted shadows, rolled-off highlights)
  texture: z.string().trim().default(""), // grain, paper fibre, dust, wear, imperfection — the realism cues
  mood: z.string().trim().default(""), // 1-2 anchor words / named aesthetic
  accentPhrase: z.string().trim().min(1), // the exact words from the hook to colour
  accentColor: z.string().trim().min(1), // e.g. "electric orange"
  colorField: z.string().trim().min(1), // background colour field / paper
  labelTag: z.string().trim().default(""), // pill label like "FOR SMB FOUNDERS"
  subhead: z.string().trim().default(""), // italic serif / marker supporting line
  cta: z.string().trim().default("Book a free AI audit"),
});
export type RenderConcept = z.infer<typeof renderConceptSchema>;

/** The Art Director prompt: given a topic, design a scroll-stopping WOBBLE render concept (treatment + a real
 *  physical metaphor + accent + colour), matching the reference library's craft. */
export function buildArtDirectorPrompt(input: { hook: string; teachingJob: string; pillar?: string; platform?: string }): { system: string; user: string } {
  const system = `You are WOBBLE's ART DIRECTOR + photographer + gaffer + colourist. Design ONE scroll-stopping social static in the real WOBBLE / Moiz Khan style — a directed PHOTOGRAPH/render, not a bland AI poster.

${WOBBLE_VISUAL_SYSTEM}

METHOD — decide every slot like a real shoot (the difference between amateur and pro is how much YOU decide vs. let the model default):
- Turn the topic into a concrete, cleverly LITERAL physical metaphor built from real objects (like: a giant glossy magnet labelled AGENCY pulling clay houses; mini shopping carts arranged as a donut chart; a hand-drawn notebook page). Describe a real SCENE.
- LIGHT is physics, never vibe: name the source, direction/angle, colour temperature (Kelvin), hard/soft quality, fill, rim, and the exact SHADOW it casts.
- CAMERA: framing (close/wide/top-down), viewpoint (eye-level/low), the focal-length + aperture FEEL (e.g. "50mm three-quarter, f4, background falling gently soft"), and reserved clean space for the headline.
- GRADE: a film stock / tone curve (lifted shadows, rolled-off highlights) — not "cinematic".
- TEXTURE: real imperfection — grain, paper fibre, dust, wear, contact shadows, uneven exposure — so it reads photographed, not synthetic.
- Choose the treatment + a saturated colour field. Pick ONE accent phrase FROM the headline.

Respond with STRICT JSON only (every field filled, specific and physical):
{"treatment":"cinematic_3d|photographic_dataviz|hand_notebook","metaphor":"the SCENE: objects, arrangement, setting","subject":"the hero object(s): exact material, finish, condition","light":"source + direction/angle + Kelvin + hard/soft + fill + rim + the shadow it casts","camera":"framing + viewpoint + focal-length/aperture feel + reserved copy space","grade":"film stock / tone curve","texture":"grain / fibre / dust / wear / imperfection cues","mood":"1-2 anchor words","accentPhrase":"exact words FROM the headline to colour","accentColor":"e.g. electric orange","colorField":"background colour field or paper","labelTag":"short pill label e.g. FOR SMB FOUNDERS","subhead":"one short supporting line","cta":"short pill CTA"}`;
  const user = `HEADLINE (exact, render verbatim): "${input.hook}"\nTEACHING IDEA: ${input.teachingJob}\n${input.pillar ? `PILLAR: ${input.pillar}\n` : ""}${input.platform ? `PLATFORM: ${input.platform}\n` : ""}Direct the shot. Fill EVERY slot with specific, physical decisions. STRICT JSON only.`;
  return { system, user };
}

/** Parse the art director's JSON concept (tolerant of fences/prose). Returns null if it can't be trusted. */
export function parseRenderConcept(text: string): RenderConcept | null {
  return parseJsonObject(text, renderConceptSchema);
}

// ── Carousel director (design a whole teaching DECK from a topic) ──────────────────────────────────────

export const carouselDeckSchema = z.object({
  treatment: z.enum(RENDER_TREATMENTS).default("hand_notebook"),
  accentColor: z.string().trim().default("electric orange"),
  colorField: z.string().trim().default("cream paper"),
  labelTag: z.string().trim().default(""),
  slides: z
    .array(
      z.object({
        role: z.enum(CAROUSEL_SLIDE_ROLES).default("mechanism"),
        heading: z.string().trim().min(1),
        body: z.string().trim().default(""),
      }),
    )
    .min(3)
    .max(8),
});
export type CarouselDeck = z.infer<typeof carouselDeckSchema>;

/** The Carousel Director: turn a topic into a cohesive teaching DECK (cover → problem → mechanism steps → proof → CTA). */
export function buildCarouselDirectorPrompt(input: { hook: string; teachingJob: string; pillar?: string }): { system: string; user: string } {
  const system = `You are WOBBLE's CAROUSEL DIRECTOR. Turn the topic into a cohesive 5-7 slide teaching carousel in the WOBBLE style — a viewer should SWIPE and actually learn the mechanism, then get one soft CTA. Every slide teaches a different layer (never repeat).

${WOBBLE_VISUAL_SYSTEM}

Structure: slide 1 = COVER (the hook), then PROBLEM, then 2-4 MECHANISM slides (the real steps — tools, inputs, actions, outputs, decisions, failure routes), optionally PROOF, then a CTA slide. Keep each slide's text tight and concrete.

Respond with STRICT JSON only:
{"treatment":"cinematic_3d|photographic_dataviz|hand_notebook","accentColor":"e.g. electric orange","colorField":"background colour field or paper","labelTag":"short pill label","slides":[{"role":"cover|problem|mechanism|proof|cta","heading":"short slide heading","body":"1-2 tight teaching lines"}]}`;
  const user = `HOOK (slide 1 cover, exact): "${input.hook}"\nTEACHING JOB (the mechanism to actually teach across the deck): ${input.teachingJob}\n${input.pillar ? `PILLAR: ${input.pillar}\n` : ""}Design the deck. STRICT JSON only.`;
  return { system, user };
}

export function parseCarouselDeck(text: string): CarouselDeck | null {
  return parseJsonObject(text, carouselDeckSchema);
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
  subject?: string;
  light?: string;
  camera?: string;
  grade?: string;
  texture?: string;
  mood?: string;
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
    subject: input.subject,
    light: input.light,
    camera: input.camera,
    grade: input.grade,
    texture: input.texture,
    mood: input.mood,
    labelTag: input.labelTag,
    cta: input.cta,
    brandNotes: input.brandNotes,
  });
  return { renderId: opts.id ?? newId("render"), kind: "static", model, items: [{ slideIndex: 0, role: "static", prompt }] };
}
