import type { WordTiming } from "@/lib/domain/reel-voice";

/**
 * Reel AUTHORING — the brief + guardrails that let an AI motion-design agent AUTHOR a complete HyperFrames
 * composition (HTML + CSS + GSAP) per reel, the way the real WOBBLE reels are hand-made, instead of filling a
 * fixed template. This is what unlocks the FULL effect vocabulary: the animator writes any effect it wants,
 * grounded in the effect catalog + on-brand exemplars, constrained only by the HyperFrames contract + the brand
 * + hard SEEK-SAFETY rules (every frame is the paused master timeline seeked to an exact time, so all motion must
 * live on that timeline — no wall-clock timers, no CSS keyframes, no un-seeded randomness). A validator rejects
 * anything unsafe so the renderer never captures broken or non-deterministic frames; the caller falls back to
 * the template generator when authoring fails.
 */

/** The hard contract every composition (ours, authored, or a real reel) must satisfy for the renderer to seek it. */
export const HYPERFRAMES_CONTRACT = [
  "The root element is <div id=\"comp\" data-composition-id=\"master\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"DUR\">. Canvas is exactly 1080x1920.",
  "Load GSAP from the CDN: <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>. All animation uses GSAP.",
  "Build ONE PAUSED master timeline: const tl = gsap.timeline({ paused: true }); … and publish it: window.__timelines = window.__timelines || {}; window.__timelines[\"master\"] = tl;",
  "EVERY animated value is a tl.set / tl.to / tl.fromTo placed at an ABSOLUTE time (seconds) on that timeline. The renderer seeks tl to each frame's time and screenshots — so the whole picture must be a pure function of the timeline position.",
  "Scenes: <section class=\"scene …\" data-in=\"S\" data-out=\"E\"> shown between S and E (tl.set(scene,{autoAlpha:1},S) … tl.set(scene,{autoAlpha:0},E)). Beat-cut every ~1–2s.",
  "Spoken words reveal on the beat: wrap each word <span class=\"w\" data-t=\"T\">word</span> and tl.fromTo(word,{opacity:0,yPercent:60},{opacity:1,yPercent:0,duration:0.2,ease:'power3.out'},T) at its spoken time T.",
  "Audio: include <audio id=\"vo\" src=\"AUDIO_SRC\" data-start=\"0\" data-duration=\"DUR\" data-track-index=\"0\" data-volume=\"1\"></audio> (the renderer muxes the real VO separately; just declare it).",
  "The last timeline op must reach DUR, e.g. tl.set({},{},DUR), so the composition spans the full length.",
];

/** Hard rules that keep authored motion deterministic under frame-by-frame seeking + on-brand. */
export const REEL_AUTHORING_RULES = [
  "SEEK-SAFE ONLY. Do NOT use setTimeout, setInterval, requestAnimationFrame, CSS @keyframes/animation, or transitions to drive motion — the renderer does not play the timeline, it SEEKS it. Every moving thing must be a GSAP tween on the master timeline.",
  "DETERMINISTIC. No Math.random(), Date.now(), or new Date(). If you need randomness (particles, jitter), use a seeded PRNG defined inline (e.g. let s=1234; const rnd=()=>{s=(s*1664525+1013904223)&0x7fffffff;return s/0x7fffffff;}).",
  "BRAND COLORS ONLY (WOBBLE): ink #0A0A0A / #09111A / #161616, off-white #F4F1EA / #EAF2FF, cream #FFF7ED, electric blue #2563FF, orange #FF6B00, lime #B8FF2C, plus semantic red #FF4A3D, green #22C55E, amber #FFB020, dim grey. NEVER purple. Backgrounds rotate black / cream / orange / blue across scenes (the 3-part narrative: dark PROBLEM → light EXPLAIN → blue or orange FIX/CTA).",
  "Fonts: Inter (700–900) for headlines, Space Mono for labels/monospace, Instrument Serif for editorial lines — from Google Fonts with display=block. Always keep an animated grain + radial vignette layer for depth (static overlays, not animated).",
  "Self-contained: inline all CSS + JS. Only external refs allowed are the Google Fonts + the GSAP CDN. No images, no external JS libraries beyond GSAP.",
  "The WOBBLE wordmark 'wobble.' (blue dot) sits bottom-left as a small mark, OR the signoff is colors-only — never another brand's name/logo.",
];

/** A compact, CORRECT reference composition — the strongest teaching signal (the model riffs on this shape). */
export const REEL_COMPACT_EXEMPLAR = `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=Space+Mono:wght@700&display=block" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  :root{--ink:#0A0A0A;--off:#EAF2FF;--orange:#FF6B00;--blue:#2563FF;--green:#22C55E;--dim:#8a8f99;}
  *{margin:0;padding:0;box-sizing:border-box;} html,body{width:1080px;height:1920px;background:var(--ink);overflow:hidden;}
  #comp{position:relative;width:1080px;height:1920px;overflow:hidden;background:var(--ink);font-family:"Inter",sans-serif;}
  .scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;padding:0 92px;text-align:center;opacity:0;visibility:hidden;}
  .bg-k{background:radial-gradient(85% 55% at 50% 36%,#141414,#060606 72%);color:var(--off);}
  .bg-o{background:radial-gradient(90% 62% at 50% 42%,#ff8f3c,#ff6b00);color:#160a00;}
  .head{font-weight:900;font-size:104px;line-height:1.02;letter-spacing:-.035em;} .head.xl{font-size:150px;}
  .w{display:inline-block;will-change:transform,opacity;} .o{color:var(--orange);}
  .crm{width:720px;background:#14161c;border:1.5px solid #262a33;border-radius:24px;overflow:hidden;}
  .crm .row{display:flex;justify-content:space-between;padding:22px 30px;border-bottom:1px solid #22262f;font-weight:700;font-size:36px;}
  .money{font-weight:900;font-size:210px;color:var(--green);}
  #grain{position:absolute;inset:0;z-index:70;pointer-events:none;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");}
  #vign{position:absolute;inset:0;z-index:71;pointer-events:none;background:radial-gradient(120% 85% at 50% 42%,transparent 55%,rgba(0,0,0,.45));}
  .mark{position:absolute;left:60px;bottom:52px;z-index:75;font-weight:900;font-size:40px;color:var(--off);opacity:.85;} .mark b{color:var(--blue);}
</style></head><body>
<div id="comp" data-composition-id="master" data-width="1080" data-height="1920" data-start="0" data-duration="8.00">
  <div class="scene bg-k" data-in="0.0" data-out="2.4"><div class="head xl"><span class="w" data-t="0.0">You're</span> <span class="w o" data-t="0.5">losing</span> <span class="w" data-t="1.0">leads.</span></div></div>
  <div class="scene bg-k" data-in="2.4" data-out="5.0">
    <div class="crm"><div class="row" id="r1">Sarah M.<span>cold</span></div><div class="row" id="r2">Mike T.<span>cold</span></div></div>
    <div class="head" style="font-size:64px"><span class="w o" data-t="3.4">Going cold.</span></div>
  </div>
  <div class="scene bg-o" data-in="5.0" data-out="8.0"><div class="head" style="color:#160a00">$<span class="money" id="m" style="font-size:150px">0</span></div><div class="head" style="font-size:56px;color:#160a00"><span class="w" data-t="6.6">recovered.</span></div></div>
  <div class="mark">wobble<b>.</b></div><div id="grain"></div><div id="vign"></div>
</div>
<audio id="vo" src="voiceover.mp3" data-start="0" data-duration="8.00" data-track-index="0" data-volume="1"></audio>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  document.querySelectorAll('.scene').forEach((sc,i)=>{ const s=parseFloat(sc.dataset.in),e=parseFloat(sc.dataset.out);
    tl.set(sc,{autoAlpha:1},s); tl.fromTo(sc,{scale:1.04,filter:'blur(8px)'},{scale:1,filter:'blur(0px)',duration:0.24,ease:'power2.out'},s); tl.set(sc,{autoAlpha:0},e); });
  document.querySelectorAll('.w[data-t]').forEach(w=>{ const t=parseFloat(w.dataset.t); tl.fromTo(w,{opacity:0,yPercent:60},{opacity:1,yPercent:0,duration:0.2,ease:'power3.out'},t); });
  ['#r1','#r2'].forEach((id,k)=>{ tl.fromTo(id,{opacity:0,x:-20},{opacity:1,x:0,duration:0.3},2.6+k*0.2); tl.to(id,{opacity:0.4,duration:0.4},3.4); });
  const o={v:0}; tl.to(o,{v:14200,duration:1.4,ease:'power1.out',onUpdate:()=>{document.getElementById('m').textContent=Math.round(o.v).toLocaleString('en-US');}},5.3);
  tl.set({},{},8.00);
  window.__timelines["master"] = tl;
</script></body></html>`;

export interface AuthorReelInput {
  topic: string;
  angle?: string;
  narration: string;
  words: WordTiming[];
  durationSec: number;
  audioSrc: string;
  /** the effect catalog (the big library the animator draws from) — assembled by the caller. */
  catalog: string;
}

function wordTable(words: WordTiming[]): string {
  return words.map((w, i) => `${i}:${w.word}@${w.start.toFixed(2)}`).join(" ");
}

/** The animator brief: author a full, seek-safe, on-brand HyperFrames composition for THIS reel. */
export function buildAnimatorPrompt(input: AuthorReelInput): { system: string; user: string } {
  const system = [
    "You are the WOBBLE REEL ANIMATOR — a senior motion designer who hand-authors HyperFrames video compositions (HTML + CSS + GSAP) for vertical Reels. You do NOT fill a template; you AUTHOR the whole composition, choosing the effects that make THIS script land.",
    "## The effect library you can draw from (use MANY — kinetic type, UI mockups, data devices, transitions, ambience, motion/impact; every reel should feel distinct):",
    input.catalog,
    "## The HyperFrames contract (MANDATORY — the renderer seeks a paused timeline):\n- " + HYPERFRAMES_CONTRACT.join("\n- "),
    "## Hard rules:\n- " + REEL_AUTHORING_RULES.join("\n- "),
    "## A compact CORRECT reference composition to learn the shape from (author something RICHER + specific to the topic — more scenes, more effects, a real UI mockup, a data device):\n" + REEL_COMPACT_EXEMPLAR,
    "## Output: return ONLY the complete HTML document (<!doctype html> … </html>). No markdown fences, no commentary.",
  ].join("\n\n");
  const targetScenes = Math.max(8, Math.min(16, Math.round(input.durationSec / 1.8))); // beat-cut every ~1.8s
  const user = [
    `Topic: ${input.topic}${input.angle ? `\nAngle: ${input.angle}` : ""}`,
    `Total duration: ${input.durationSec.toFixed(2)}s. Audio src to declare: "${input.audioSrc}".`,
    `Narration (already voiced): ${input.narration}`,
    `Spoken words as index:word@startSeconds — reveal each on its beat, and time scenes/effects to these:\n${wordTable(input.words)}`,
    `RICHNESS REQUIREMENTS (the compact exemplar is a MINIMUM — author far richer):`,
    `- Aim for ~${targetScenes} scenes, beat-cutting every ~1–2s (one idea per scene). Rotate the background across scenes (dark → cream/orange → blue) for the 3-part narrative.`,
    `- Use AT LEAST: one rich UI MOCKUP with REALISTIC content (real lead names like "Sarah M. — replied ✓", real chat bubbles, a real calendar slot — NEVER generic labels like "Leads: cold"), one DATA device (a money/number count-up or a bar/donut), and 2–3 impact/motion touches (a white flash, a scale-pulse, a chip pop).`,
    `- Compose ≥10 distinct effects across ≥4 groups from the library. Every scene must have internal motion — no dead air.`,
    "Author the full composition now. Follow the 4-beat spine (hook → value/proof with the mockup + data device → the turn → soft CTA 'book a free AI audit'). Output ONLY the HTML.",
  ].join("\n\n");
  return { system, user };
}

/** Pull the HTML document out of the model's reply (tolerate fences / stray prose around it). */
export function extractComposition(text: string): string | null {
  if (!text) return null;
  let body = text.trim();
  const fence = body.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.search(/<!doctype html>|<html[\s>]/i);
  if (start < 0) return null;
  const end = body.toLowerCase().lastIndexOf("</html>");
  if (end < 0) return null;
  return body.slice(start, end + "</html>".length);
}

export interface CompositionValidation {
  ok: boolean;
  issues: string[];
}

/**
 * Reject any authored composition that would render broken or non-deterministically. Fatal issues (→ ok:false):
 * missing contract, missing/unpaused master timeline, or wall-clock/non-deterministic motion. This is the safety
 * gate that lets us trust LLM-authored HTML in the render pipeline.
 */
export function validateComposition(html: string): CompositionValidation {
  const issues: string[] = [];
  if (!html || html.length < 400) return { ok: false, issues: ["composition is empty or too short"] };

  // Contract presence.
  if (!/data-composition-id\s*=\s*["']master["']/.test(html)) issues.push("missing #comp data-composition-id=\"master\"");
  if (!/__timelines\s*\[\s*["']master["']\s*\]|__timelines\.master/.test(html)) issues.push("does not publish window.__timelines[\"master\"]");
  if (!/gsap\.timeline\s*\(/.test(html)) issues.push("no gsap.timeline() — nothing to seek");
  if (!/paused\s*:\s*true|\.pause\s*\(/.test(html)) issues.push("master timeline is not paused (paused:true) — it must not auto-play");
  if (!/cdn\.jsdelivr\.net\/npm\/gsap|gsap\.min\.js|unpkg\.com\/gsap/.test(html)) issues.push("GSAP CDN <script> is missing — gsap will be undefined");
  if (!/data-t\s*=|data-in\s*=/.test(html)) issues.push("no timed content (.w[data-t] words or scene[data-in])");

  // Seek-safety: wall-clock / non-deterministic motion is forbidden.
  if (/\bsetTimeout\s*\(/.test(html)) issues.push("uses setTimeout (wall-clock — not seek-safe)");
  if (/\bsetInterval\s*\(/.test(html)) issues.push("uses setInterval (wall-clock — not seek-safe)");
  if (/requestAnimationFrame\s*\(/.test(html)) issues.push("uses requestAnimationFrame (wall-clock — not seek-safe)");
  if (/@keyframes/i.test(html) || /animation\s*:(?![^;]*none)/.test(html)) issues.push("uses CSS @keyframes/animation (wall-clock — not seek-safe; animate via GSAP)");
  if (/Math\.random\s*\(/.test(html)) issues.push("uses Math.random() (non-deterministic — use a seeded PRNG)");
  if (/Date\.now\s*\(|new\s+Date\s*\(/.test(html)) issues.push("uses Date.now()/new Date() (non-deterministic)");

  // Brand.
  if (/purple|#[0-9a-f]*(8a2be2|6b21a8|7c3aed|purple)/i.test(html)) issues.push("contains purple (off-brand)");

  // Fatal = anything that breaks rendering or determinism. (Brand issues are fatal too — the founder is strict on brand.)
  return { ok: issues.length === 0, issues };
}
