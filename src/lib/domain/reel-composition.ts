import type { WordTiming } from "@/lib/domain/reel-voice";

/**
 * Reel composition (HyperFrames) — the pure HTML generator. Turns a scene plan + per-word VO timings into a
 * seek-driven HyperFrames composition matching the WOBBLE reel system (kinetic typography, the 3-colour
 * narrative — near-black problem → cream explain → electric-blue fix/CTA — bold headlines with ONE accent word
 * per line, grain + vignette). Each `.w[data-t]` word reveals on its spoken beat; a paused GSAP timeline on
 * window.__timelines["master"] drives it deterministically for the renderer.
 */

export type ReelBg = "dark" | "light" | "blue" | "signoff";
export type ReelAccent = "blue" | "orange" | "lime" | "dim" | "ink";

export interface ReelWordSpec {
  text: string;
  t: number; // spoken start time (from the VO alignment)
  accent?: ReelAccent;
}
export interface ReelLineSpec {
  words: ReelWordSpec[];
  size?: "sm" | "" | "xl";
  serif?: boolean;
  kicker?: boolean; // mono uppercase label
}
export interface ReelScene {
  bg: ReelBg;
  in: number;
  out: number;
  lines: ReelLineSpec[];
}

export interface ReelCompositionInput {
  title?: string;
  scenes: ReelScene[];
  audioSrc: string; // relative to the html (e.g. "voiceover.mp3")
  durationSec: number;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lineHtml(line: ReelLineSpec): string {
  const cls = line.kicker ? "kick" : line.serif ? "serif" : `h${line.size ? " " + line.size : ""}`;
  const inner = line.words
    .map((w) => `<span class="w${w.accent ? " " + w.accent : ""}" data-t="${w.t.toFixed(2)}">${esc(w.text)}</span>`)
    .join(" ");
  return `<div class="${cls}">${inner}</div>`;
}

function sceneHtml(s: ReelScene): string {
  const bgClass = s.bg === "light" ? "lightbg" : s.bg === "blue" ? "bluebg" : s.bg === "signoff" ? "signoff" : "dark";
  return `<section class="scene ${bgClass}" data-in="${s.in.toFixed(2)}" data-out="${s.out.toFixed(2)}">\n    ${s.lines.map(lineHtml).join("\n    ")}\n  </section>`;
}

/** Build the full HyperFrames reel HTML (self-contained except Google Fonts + GSAP CDN, which the renderer loads). */
export function buildReelComposition(input: ReelCompositionInput): string {
  const scenes = input.scenes.map(sceneHtml).join("\n\n  ");
  const dur = input.durationSec.toFixed(2);
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=block" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<title>${esc(input.title ?? "WOBBLE reel")}</title>
<style>
  :root{ --ink:#0A0A0A; --blue:#2563FF; --orange:#FF6B00; --lime:#B8FF2C; --light:#EAF2FF; --paper:#FFF7ED; --off:#EAF2FF; --dim:#59636f; }
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1080px;height:1920px;background:var(--ink);overflow:hidden;}
  #comp{position:relative;width:1080px;height:1920px;background:var(--ink);overflow:hidden;}
  #grain{position:absolute;inset:0;z-index:40;pointer-events:none;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");}
  #vign{position:absolute;inset:0;z-index:41;pointer-events:none;background:radial-gradient(120% 90% at 50% 42%, transparent 55%, rgba(0,0,0,.55) 100%);}
  .scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 96px;text-align:center;opacity:0;visibility:hidden;gap:26px;}
  .scene.dark{background:radial-gradient(90% 60% at 50% 38%, #14161a 0%, var(--ink) 62%);}
  .scene.lightbg{background:linear-gradient(180deg,#eef4ff 0%, var(--light) 100%);}
  .scene.lightbg .h{color:var(--ink);} .scene.lightbg .kick{color:#7a8494;}
  .scene.bluebg{background:radial-gradient(90% 70% at 50% 42%, #2f6bff 0%, #1746c8 75%);}
  .scene.bluebg .h{color:#fff;}
  .scene.signoff{background:radial-gradient(80% 55% at 50% 45%, #14181c 0%, #060607 70%);}
  .h{font-family:"Inter",system-ui,sans-serif;font-weight:800;color:var(--off);font-size:118px;line-height:1.02;letter-spacing:-0.03em;}
  .h.sm{font-size:92px;} .h.xl{font-size:150px;}
  .w{display:inline-block;will-change:transform,opacity;}
  .blue{color:var(--blue);} .orange{color:var(--orange);} .lime{color:var(--lime);} .dim{color:var(--dim);} .ink{color:var(--ink);}
  .scene.bluebg .lime{color:#eaff9d;}
  .kick{font-family:"Space Mono",monospace;font-weight:700;font-size:30px;letter-spacing:.32em;text-transform:uppercase;color:var(--dim);}
  .serif{font-family:"Instrument Serif",serif;font-weight:400;font-style:italic;font-size:104px;line-height:1.06;color:var(--off);}
  .mark{position:absolute;left:60px;bottom:56px;z-index:42;font-family:"Inter",sans-serif;font-weight:900;font-size:44px;color:var(--off);opacity:.9;}
  .mark b{color:var(--blue);}
</style></head>
<body>
<div id="comp" data-composition-id="master" data-width="1080" data-height="1920" data-start="0" data-duration="${dur}">
  ${scenes}
  <div class="mark">wobble<b>.</b></div>
  <div id="grain"></div><div id="vign"></div>
</div>
<audio id="vo" src="${esc(input.audioSrc)}" data-start="0" data-duration="${dur}" data-track-index="0" data-volume="1"></audio>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  document.querySelectorAll('.scene').forEach(sc=>{
    const inT=parseFloat(sc.dataset.in), outT=parseFloat(sc.dataset.out);
    tl.set(sc,{autoAlpha:1},inT);
    tl.fromTo(sc,{scale:1.03,filter:'blur(6px)'},{scale:1,filter:'blur(0px)',duration:0.26,ease:'power2.out'},inT);
    tl.set(sc,{autoAlpha:0},outT);
  });
  document.querySelectorAll('.w[data-t]').forEach(w=>{
    const t=parseFloat(w.dataset.t);
    tl.fromTo(w,{opacity:0,yPercent:60},{opacity:1,yPercent:0,duration:0.22,ease:'power3.out'},t);
  });
  tl.set({}, {}, ${dur});
  window.__timelines["master"] = tl;
  window.__hfReady = true;
</script>
</body></html>`;
}

// ── Auto scene-planner (word timings → scenes) ────────────────────────────────────────────────────────

const PROBLEM_HINTS = /(lose|losing|lost|dead|graveyard|miss|missed|stall|forget|leak|cold|slow|stuck|waste|fail|drop)/i;
const FIX_HINTS = /(fix|ai|automat|system|instant|second|book|audit|now|own|build)/i;

/** Split VO word timings into a sensible scene plan: group into short lines, colour the narrative (problem =
 *  dark, mid = cream, fix/CTA = blue), and accent pain words red + fix/brand words blue. A pragmatic default
 *  the LLM scene-planner can later override. */
export function planScenesFromWords(words: WordTiming[], durationSec: number): ReelScene[] {
  if (!words.length) return [{ bg: "dark", in: 0, out: durationSec, lines: [] }];
  // group words into lines of ~3-5 words, breaking on sentence-ending punctuation.
  const lines: ReelWordSpec[][] = [];
  let cur: ReelWordSpec[] = [];
  for (const w of words) {
    const isPain = PROBLEM_HINTS.test(w.word);
    const isFix = FIX_HINTS.test(w.word);
    cur.push({ text: w.word, t: w.start, accent: isPain ? "orange" : isFix ? "blue" : undefined });
    if (/[.!?]$/.test(w.word) || cur.length >= 5) { lines.push(cur); cur = []; }
  }
  if (cur.length) lines.push(cur);
  // one scene per line; bg follows the narrative arc (first third dark, middle cream, last third blue).
  const n = lines.length;
  return lines.map((line, i) => {
    const start = line[0].t;
    const end = i + 1 < lines.length ? lines[i + 1][0].t : durationSec;
    const frac = i / Math.max(1, n - 1);
    const bg: ReelBg = i === n - 1 ? "blue" : frac < 0.5 ? "dark" : frac < 0.78 ? "light" : "blue";
    const size = line.length <= 2 ? "xl" : line.length >= 5 ? "sm" : "";
    return { bg, in: start, out: end, lines: [{ words: line, size }] };
  });
}
