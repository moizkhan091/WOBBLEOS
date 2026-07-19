import type { WordTiming } from "@/lib/domain/reel-voice";

/**
 * Reel composition (HyperFrames) — the pure HTML generator. Turns a scene plan + per-word VO timings into a
 * seek-driven HyperFrames composition matching the WOBBLE reel system: kinetic typography (the 3-colour
 * narrative — near-black problem → cream explain → electric-blue fix/CTA — bold headlines with ONE accent word
 * per line) PLUS animated UI mockups (a CRM lead pipeline with HOT/STUCK chips, metric tiles that count up, an
 * SMS thread, a booking toast) exactly like the reference reels. These mockups are a VOCABULARY — the reel
 * director (LLM) decides which one fits a topic and fills it with topic-specific content, so they're never a
 * reused template. Every `.w[data-t]` word and every mockup element reveals on its beat; a paused GSAP timeline
 * on window.__timelines["master"] drives it deterministically for the renderer (each frame = the timeline seeked
 * to an exact time).
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

// ── UI mockups (the animated cards from the reference reels — Group C, "our viral weapon") ──────────────
export type ReelChip = "hot" | "stuck" | "late" | "new" | "won" | "ok";
export interface ReelKanbanCard {
  name: string;
  meta?: string; // e.g. "Roofing · 2d ago"
  chip?: ReelChip; // status pill
}
export interface ReelKanbanColumn {
  title: string; // "NEW" | "HOT" | "STALLED"
  cards: ReelKanbanCard[];
}
export interface ReelMetricTile {
  value: string; // "64%" | "$0.03" | "90s"
  label: string; // "fewer no-shows"
  countTo?: number; // if set, the number counts up to this (value is the formatted target)
  accent?: ReelAccent;
}
export interface ReelChatBubble {
  from: "them" | "us";
  text: string;
}
export type ReelMockup =
  | { kind: "kanban"; columns: ReelKanbanColumn[] }
  | { kind: "metrics"; tiles: ReelMetricTile[] }
  | { kind: "chat"; header?: string; bubbles: ReelChatBubble[] }
  | { kind: "notification"; title: string; body?: string };

export interface ReelScene {
  bg: ReelBg;
  in: number;
  out: number;
  lines: ReelLineSpec[];
  /** optional animated UI mockup rendered above the lines (staggers in at the scene's `in`). */
  mockup?: ReelMockup;
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

const CHIP_LABEL: Record<ReelChip, string> = { hot: "HOT", stuck: "STUCK", late: "LATE", new: "NEW", won: "WON", ok: "OK" };

function mockupHtml(m: ReelMockup): string {
  if (m.kind === "kanban") {
    const cols = m.columns
      .map(
        (col) => `<div class="kcol"><div class="kcolh">${esc(col.title)}</div>${col.cards
          .map((c) => `<div class="kcard mock-el"><div class="kname">${esc(c.name)}</div>${c.meta ? `<div class="kmeta">${esc(c.meta)}</div>` : ""}${c.chip ? `<span class="chip ${c.chip} mock-chip">${CHIP_LABEL[c.chip]}</span>` : ""}</div>`)
          .join("")}</div>`,
      )
      .join("");
    return `<div class="mock kanban">${cols}</div>`;
  }
  if (m.kind === "metrics") {
    const tiles = m.tiles
      .map(
        (t) => `<div class="tile mock-el"><div class="tval ${t.accent ?? "lime"}"${t.countTo != null ? ` data-count="${t.countTo}" data-fmt="${esc(t.value)}"` : ""}>${esc(t.value)}</div><div class="tlab">${esc(t.label)}</div></div>`,
      )
      .join("");
    return `<div class="mock metrics">${tiles}</div>`;
  }
  if (m.kind === "chat") {
    const head = m.header ? `<div class="chath">${esc(m.header)}</div>` : "";
    const bubbles = m.bubbles.map((b) => `<div class="bub ${b.from} mock-el">${esc(b.text)}</div>`).join("");
    return `<div class="mock chat">${head}<div class="thread">${bubbles}</div></div>`;
  }
  // notification toast
  return `<div class="mock"><div class="toast mock-el"><div class="tdot"></div><div><div class="ttitle">${esc(m.title)}</div>${m.body ? `<div class="tbody">${esc(m.body)}</div>` : ""}</div><div class="tcheck">✓</div></div></div>`;
}

function sceneHtml(s: ReelScene): string {
  const bgClass = s.bg === "light" ? "lightbg" : s.bg === "blue" ? "bluebg" : s.bg === "signoff" ? "signoff" : "dark";
  const mock = s.mockup ? mockupHtml(s.mockup) + "\n    " : "";
  return `<section class="scene ${bgClass}" data-in="${s.in.toFixed(2)}" data-out="${s.out.toFixed(2)}">\n    ${mock}${s.lines.map(lineHtml).join("\n    ")}\n  </section>`;
}

/** Build the full HyperFrames reel HTML (self-contained except Google Fonts + GSAP CDN, which the renderer loads). */
export function buildReelComposition(input: ReelCompositionInput): string {
  const scenes = input.scenes.map(sceneHtml).join("\n\n  ");
  const dur = input.durationSec.toFixed(2);
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=block" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<title>${esc(input.title ?? "WOBBLE reel")}</title>
<style>
  :root{ --ink:#0A0A0A; --blue:#2563FF; --orange:#FF6B00; --lime:#B8FF2C; --light:#EAF2FF; --paper:#FFF7ED; --off:#EAF2FF; --dim:#59636f; --red:#FF3B3B; --amber:#FFB020; --green:#22C55E; }
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
  /* ── UI mockups ── */
  .mock{width:100%;font-family:"Inter",sans-serif;}
  .kanban{display:flex;gap:22px;justify-content:center;}
  .kcol{flex:1;max-width:300px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:22px;padding:18px 16px;display:flex;flex-direction:column;gap:14px;}
  .kcolh{font-family:"Space Mono",monospace;font-size:22px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;text-align:left;}
  .kcard{position:relative;background:#15181d;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 16px;text-align:left;box-shadow:0 10px 30px rgba(0,0,0,.35);will-change:transform,opacity;}
  .kname{font-size:30px;font-weight:700;color:#fff;}
  .kmeta{font-size:20px;color:var(--dim);margin-top:6px;}
  .chip{display:inline-block;margin-top:14px;font-size:20px;font-weight:800;letter-spacing:.08em;padding:6px 14px;border-radius:999px;will-change:transform;}
  .chip.hot{background:rgba(34,197,94,.16);color:var(--green);} .chip.won{background:rgba(34,197,94,.16);color:var(--green);} .chip.ok{background:rgba(37,99,255,.16);color:#7aa2ff;}
  .chip.stuck{background:rgba(255,59,59,.16);color:var(--red);} .chip.late{background:rgba(255,176,32,.16);color:var(--amber);} .chip.new{background:rgba(255,255,255,.08);color:#cfd6df;}
  .metrics{display:flex;gap:26px;justify-content:center;}
  .tile{flex:1;max-width:320px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:26px;padding:44px 28px;will-change:transform,opacity;}
  .tval{font-size:132px;font-weight:900;line-height:.9;letter-spacing:-.03em;}
  .tlab{font-size:30px;color:#aeb6c2;margin-top:16px;font-weight:600;}
  .scene.bluebg .tile{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);}
  .chat{max-width:640px;margin:0 auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:34px;padding:26px;}
  .chath{font-size:24px;color:var(--dim);text-align:left;margin-bottom:18px;font-weight:700;}
  .thread{display:flex;flex-direction:column;gap:16px;}
  .bub{max-width:78%;padding:22px 26px;border-radius:26px;font-size:32px;line-height:1.3;will-change:transform,opacity;}
  .bub.them{align-self:flex-start;background:#1c2026;color:#eef2f7;border-bottom-left-radius:8px;}
  .bub.us{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:8px;}
  .toast{display:flex;align-items:center;gap:22px;max-width:640px;margin:0 auto;background:#15181d;border:1px solid rgba(255,255,255,0.1);border-radius:26px;padding:30px 34px;box-shadow:0 20px 60px rgba(0,0,0,.45);will-change:transform,opacity;}
  .tdot{width:16px;height:16px;border-radius:50%;background:var(--green);box-shadow:0 0 0 6px rgba(34,197,94,.18);}
  .ttitle{font-size:34px;font-weight:800;color:#fff;text-align:left;} .tbody{font-size:26px;color:#aeb6c2;text-align:left;margin-top:4px;}
  .tcheck{margin-left:auto;font-size:40px;color:var(--green);font-weight:900;}
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
    // mockup elements stagger IN just after the scene appears (deterministic, seek-driven).
    sc.querySelectorAll('.mock-el').forEach((el,i)=>{ tl.fromTo(el,{opacity:0,y:46,scale:0.96},{opacity:1,y:0,scale:1,duration:0.34,ease:'back.out(1.5)'},inT+0.14+i*0.10); });
    sc.querySelectorAll('.mock-chip').forEach((el,i)=>{ tl.fromTo(el,{scale:0},{scale:1,duration:0.3,ease:'back.out(2.2)'},inT+0.4+i*0.10); });
    sc.querySelectorAll('.tval[data-count]').forEach((el)=>{
      const to=parseFloat(el.dataset.count)||0, fmt=el.dataset.fmt||''; const prefix=(fmt.match(/^[^0-9]*/)||[''])[0]; const suffix=(fmt.match(/[^0-9.,]*$/)||[''])[0];
      const o={v:0}; tl.to(o,{v:to,duration:0.9,ease:'power2.out',onUpdate:()=>{ el.textContent=prefix+Math.round(o.v)+suffix; }},inT+0.2);
    });
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
 *  dark, mid = cream, fix/CTA = blue), and accent pain words orange + fix/brand words blue. The DETERMINISTIC
 *  fallback the LLM director overrides (the director also attaches topic-specific mockups). */
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
