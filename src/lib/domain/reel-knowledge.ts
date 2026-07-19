/**
 * REEL CRAFT KNOWLEDGE — the compiled Phase-9 reel factory doctrine (VIDEO-REEL-SYSTEM, VIDEO-SCRIPT-PLAYBOOK,
 * REEL-FORMAT-LIBRARY, EFFECTS-LIBRARY, RETENTION-PLAYBOOK, CONVERSION-PSYCHOLOGY, VISUAL-VARIETY-EXPANSION,
 * VOICE-SETTINGS). This is what makes the reel writer + director agents KNOW the craft instead of running off a
 * thin hand-written brief: the 4-beat spine, the 3-second-hook law, rehook cadence, the format library, the
 * effect/mockup vocabulary mapped to what our HyperFrames engine can ACTUALLY render, the style lanes, the
 * conversion triggers, VO delivery, and the hard voice rules. The prompts pull the slice each agent needs.
 */

/** The non-negotiables every reel obeys. */
export const REEL_GOVERNING_PRINCIPLES = [
  "THE VALUE IS THE AD. Give away the what + why (even the DIY how); sell the done-for-you WHO. Test: would the owner watch, learn, screenshot and share it WITH THE CTA REMOVED? If no, it's not good enough. WOBBLE sells done-for-you AI systems the owner can't build themselves, so generosity never cannibalises the offer — it proves we know AI cold.",
  "ONE avatar, always: the AI-curious local-business owner who wants AI working for them. The niche (dental, roofing, real estate, clinic…) is just the topic — the psychographic and the promise never change, so the algorithm stays coherent.",
  "ONE CTA only: book a free AI audit. NEVER comment-bait ('comment X to get Y'). Deliver the value in the video; the soft close + the power-of-suggestion bank-shot do the selling (they conclude we're the AI experts and that doing it across their whole business is a grind they'd rather hand off).",
  "Specific > vague, mechanism > labour: reveal the FLOW ('here's what the system does'), never the tedium ('we install it in 48h, you never touch it'). Precise numbers feel true; 'faster/better' reads as hype.",
];

/** The constant skeleton of every reel (timings scale with length). */
export const REEL_FOUR_BEAT_SPINE = [
  "HOOK (0–3.5s): cold-open on a NUMBER, CLAIM, or the exact TEMPLATE. Pattern-interrupt, type already in motion. First on-screen line ≤7 words, high contrast, lands with sound OFF. No logo, no 'are you a business owner', no dissolve in the first 5s.",
  "VALUE / PROOF (3.5–14s): the actual teaching — the math builds, the script reveals, the curve draws, the AI works on screen. Screenshot-able. Drip a number/named tool every few seconds.",
  "TURN (14–18s): the reframe — the leak has a fix / this runs on autopilot. Implies the offer without pitching.",
  "SIGNOFF (18–20s): tiny brand card. ORGANIC cut ends on value (soft curiosity CTA); PAID cut swaps in ONE direct CTA line. Same master, two exports.",
];

/** Retention law + hook + rehook (VIDEO-SCRIPT-PLAYBOOK + RETENTION-PLAYBOOK). */
export const REEL_RETENTION_DOCTRINE = [
  "THE ONE LAW — expectations vs reality: viewers stay when reality beats what they expected. Every line must raise curiosity OR over-deliver on it; if it does neither, cut it.",
  "3-SECOND HOOK (80% of the result): open with a bold claim, a curiosity gap/open loop, or a 'that's me' sting. Front-load the most compelling thing FIRST — zero warm-up. Contrast is the engine: they believe A, you show B; the gap = curiosity.",
  "4 ALIGNED HOOK LAYERS say the SAME thing: spoken hook, on-screen text hook, visual hook, audio/SFX hook. Eyes read ~10–100× faster than ears, so the VISUAL leads.",
  "REHOOK every ~4–8s: as one loop closes, open a new one ('here's the part that's costing you' / 'and it gets worse' / 'now watch what happens'). ESCALATE stakes each beat (small → bigger → biggest).",
  "NO DEAD AIR: beat-cut every 1–2s; if a scene sits it must have internal motion (count-up, tick, UI action). Cut any line that doesn't hook, teach, or escalate.",
  "Second-best point FIRST, best point second → an increasing-value pattern that forces them to stay for the payoff. Never lead with the weakest.",
];

/** The format library — how the SAME spine is filled differently for variety (F1–F6 + the 16 archetypes, distilled). */
export interface ReelFormat {
  key: string;
  name: string;
  what: string;
  bestFor: string;
}
export const REEL_FORMATS: ReelFormat[] = [
  { key: "leak_math", name: "Leak Math / Cost-of-Inaction", what: "animated money-left-on-table arithmetic (calls × job × close = $ gone) building on screen", bestFor: "missed-call, speed-to-lead, no-show, cart abandonment, reactivation — any quantifiable leak" },
  { key: "steal_this", name: "Steal This / Template", what: "the exact script/text/flow on screen, big and pausable — a save/share magnet (reciprocity)", bestFor: "text-back, follow-up, review requests, reactivation, DM management" },
  { key: "benchmark", name: "Benchmark / Data-Shock", what: "one real research stat as a decay curve / bar / donut — authority open", bestFor: "speed-to-lead, reviews, search visibility (only cite sourced stats)" },
  { key: "invisible_day", name: "Invisible Day", what: "a business day's timeline with every silent leak lit up — diagnostic", bestFor: "whole-brand audit, speed-to-lead, receptionist" },
  { key: "before_after", name: "Before / After", what: "chaos ~2s → hard cut on the beat → clean system — instant proof + share trigger", bestFor: "dashboard / reputation / pipeline demos" },
  { key: "mistake", name: "The Mistake", what: "the #1 mistake killing X → show it vividly → the fix (loss-framing beats gain)", bestFor: "invisible leaks, skeptics" },
  { key: "comparison", name: "Comparison / Vs", what: "two paths side by side ($4k/mo receptionist vs one AI setup) — anchors you as the rational choice", bestFor: "receptionist, voice agent, appointment-setter" },
  { key: "day_in_life", name: "Day-in-the-Life of the system", what: "follow ONE lead through the AI across a day — proof without a pitch, makes 'AI system' tangible", bestFor: "receptionist, reactivation, follow-up" },
  { key: "teardown", name: "The Teardown", what: "audit a generic business live, find the leaks — expertise by doing, makes 'book an audit' natural", bestFor: "diagnostic authority" },
  { key: "tool_teardown", name: "Tool Teardown (DIY value)", what: "'this free AI tool does X for your business task — here's exactly how', animated UI walk-through, 45–60s", bestFor: "top-of-funnel magnetism, proving AI fluency" },
  { key: "five_things", name: "The 5 Things / Tier-List", what: "rapid kinetic checklist, one-line why each — the most-SAVED format; each item exposes a gap", bestFor: "broad reach, full-menu awareness" },
];

/** Variety dials — rotate so no two neighbouring reels rhyme. */
export const REEL_VARIETY_DIALS = {
  angles: ["fear-of-loss", "greed / opportunity", "status / competitor", "curiosity", "relief / ease", "contrarian"],
  hookTriggers: ["stat", "question", "bold claim", "story", "'you'-callout", "visual pattern-interrupt"],
  /** aesthetic lanes (VISUAL-VARIETY-EXPANSION) — pick ONE per reel; adjacent reels differ. */
  styleLanes: [
    "Premium SaaS — frosted glass cards, soft gradient depth, refined product-UI mockups, big clean sans (highest trust)",
    "Editorial — serif display, generous negative space, a single hero stat",
    "Terminal / Tech — mono type, dark, terminal/app-window chrome, data readouts, blueprint grid ('under the hood')",
    "Kinetic Bold — giant sans, high-contrast black/white/orange, punchy word-by-word, minimal UI",
    "Dark Cinematic — deep blacks, gradient-morph field, glow + vignette, dramatic big-number reveals",
    "Data-Viz — charts / meters / curves / donuts as the hero on a clean grid",
  ],
};

/** Conversion triggers (CONVERSION-PSYCHOLOGY) — the writer names the lever it's pulling. */
export const REEL_CONVERSION_TRIGGERS = [
  "Loss aversion / cost-of-inaction (OUR #1 lever) — frame the status quo as active bleeding ('every week you don't fix this you burn ~$2,000').",
  "Specificity — precise numbers ('4 hours to 90 seconds', not 'faster').",
  "Curiosity / information-gap — a visible gap the brain must close.",
  "Pattern interrupt — an unexpected jolt in the first 0.5–3s.",
  "Anchoring — a high first number ('a full-time hire is $60k/yr') makes our solution feel small.",
  "Open loop (Zeigarnik) — tease the payoff, resolve at the CTA.",
  "Authority + social proof — demonstrated AI competence, 'how 40+ owners…'.",
  "Villain / enemy — name a shared enemy ('your ad platform profits when your tracking is broken').",
  "Risk reversal + light urgency at the CTA — 'free AI audit', 'taking 5 this week'.",
];

/** VO delivery rules (applies even to a cloned voice — write FOR it). */
export const REEL_DELIVERY_RULES = [
  "Energy +50% vs what feels natural. Silence between sentences is a feature.",
  "Short sentences; mix lengths so the sentence-end edge is JAGGED, not straight. Punchy jabs + the occasional long line.",
  "A half-beat breather after the word you want to LAND.",
  "Downward inflection at sentence ends (authority) — never upspeak, never trail off.",
  "Say-it-twice / distillation: first compressed (jargon ok), then a 5-year-old metaphor — two shots at comprehension.",
  "Likable expert = high authority + high affinity: mean it, proof-heavy specific numbers, plus one small admission line to build trust.",
];

/**
 * What our HyperFrames composition engine can ACTUALLY render right now — the director's concrete toolbox. Keep
 * this honest: the director must only ask for things buildReelComposition produces, mapped from the effects
 * library (E-numbers cited so the craft ↔ engine link is traceable). Expand this as the engine grows.
 */
export const REEL_RENDERABLE_CAPABILITIES = [
  "Kinetic typography — per-word reveal on the exact VO beat (E1), ONE accent word per line: orange = pain/damage, blue = fix/brand, lime = highlight (E12). Line sizes sm/normal/xl; optional serif line; optional mono uppercase kicker label.",
  "3-colour narrative backgrounds — dark (near-black, PROBLEM), light (cream, EXPLAIN), blue (electric, FIX/CTA), plus a signoff card. Radial glow + vignette + animated grain are always on (E36/E37).",
  "UI MOCKUPS (our viral weapon, Group C) — topic-specific, staggered-in on the beat: 'kanban' = a CRM lead pipeline with HOT/STUCK/LATE chips (E24); 'metrics' = 1–3 KPI tiles, a figure can count up (E25/E31); 'chat' = an SMS/WhatsApp thread with the AI's replies (E22); 'notification' = a booking/win toast (E21/E23).",
  "Scene beat-cuts every 1–2s (E13) with a scale+blur settle on entry.",
  "NOT yet renderable (do NOT ask for these): WebGL shaders, 3D objects, charts/curves/donuts, cursor demos, video/photo footage. If the point needs a chart, use a 'metrics' tile instead.",
];

/** Assemble the WRITER's brief (script craft: hook, rehook, delivery, conversion). */
export function reelWriterKnowledge(): string {
  return [
    "# WOBBLE REEL CRAFT — write to this, it is how our best reels are made.",
    "## Governing principles\n- " + REEL_GOVERNING_PRINCIPLES.join("\n- "),
    "## The 4-beat spine\n- " + REEL_FOUR_BEAT_SPINE.join("\n- "),
    "## Retention & hook law\n- " + REEL_RETENTION_DOCTRINE.join("\n- "),
    "## Conversion triggers (name the lever you pull)\n- " + REEL_CONVERSION_TRIGGERS.join("\n- "),
    "## Voice delivery (write FOR the voice)\n- " + REEL_DELIVERY_RULES.join("\n- "),
  ].join("\n\n");
}

/** Assemble the DIRECTOR's brief (visual craft + the renderable toolbox). */
export function reelDirectorKnowledge(): string {
  return [
    "# WOBBLE REEL DIRECTION — design the visuals to this.",
    "## The 4-beat spine\n- " + REEL_FOUR_BEAT_SPINE.join("\n- "),
    "## Retention (never let it drag)\n- " + REEL_RETENTION_DOCTRINE.slice(0, 5).join("\n- "),
    "## Format library — pick the one that fits THIS topic\n- " + REEL_FORMATS.map((f) => `${f.name}: ${f.what} → ${f.bestFor}`).join("\n- "),
    "## Style lanes — commit to ONE look\n- " + REEL_VARIETY_DIALS.styleLanes.join("\n- "),
    "## What the engine can render (only ask for these)\n- " + REEL_RENDERABLE_CAPABILITIES.join("\n- "),
  ].join("\n\n");
}
