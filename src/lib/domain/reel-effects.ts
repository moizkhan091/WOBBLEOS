import { REEL_FORMATS, REEL_VARIETY_DIALS, REEL_RENDERABLE_CAPABILITIES } from "@/lib/domain/reel-knowledge";
import { EFFECT_LIBRARY_DATA } from "@/lib/domain/reel-effects-data";

/**
 * Reel EFFECT CATALOG — the big library the animator draws from. It fuses two sources: (1) the craft doctrine
 * (formats + style lanes), and (2) EFFECT_LIBRARY — concrete, seek-safe animation techniques cataloged from the
 * 51-effect EFFECTS-LIBRARY doc AND every real WOBBLE reel composition (extracted per group). The animator sees
 * this whole catalog so it is NEVER limited to a few hardcoded effects — it composes freely from the full
 * vocabulary. Grow EFFECT_LIBRARY over time (more reels, the HeyGen repos) and every reel gets richer for free.
 */

export interface CatalogEffect {
  id: string;
  group: "kinetic-type" | "cut-transition" | "ui-mockup" | "data-viz" | "ambience" | "motion-impact" | "3d" | "layout";
  name: string;
  what: string;
  /** the seek-safe technique (CSS shape + GSAP calls) — enough to re-author it. */
  how: string;
  when?: string;
}

/**
 * CORE effects — a hand-curated set with FULL authoring recipes (the exact CSS + GSAP), the reliable backbone
 * the animator can author verbatim. The much larger EFFECT_LIBRARY_DATA (cataloged from all 30 real reels) is
 * merged in for breadth. Every entry is seek-safe (all motion on the paused master timeline).
 */
export const CORE_EFFECTS: CatalogEffect[] = [
  // ── kinetic typography ──
  { id: "word-pop", group: "kinetic-type", name: "Per-word pop", what: "each spoken word snaps up + fades in on its exact VO beat", how: "wrap words in .w[data-t]; tl.fromTo(w,{opacity:0,yPercent:60},{opacity:1,yPercent:0,duration:0.2,ease:'power3.out'},t)", when: "the backbone of every reel — always" },
  { id: "scale-bounce-word", group: "kinetic-type", name: "Scale-bounce word", what: "a key word overshoots from small to full", how: "tl.fromTo(el,{scale:0.6},{scale:1,duration:0.35,ease:'back.out(2.2)'},t)", when: "the ONE hero word of a line" },
  { id: "color-flip-emphasis", group: "kinetic-type", name: "Color-flip emphasis", what: "the key word tints (orange=pain, blue=fix, lime=win) on its beat", how: "give the .w an accent class (.o/.blue/.lime); the pop reveal shows the colour", when: "one accent word per line" },
  { id: "strike-through", group: "kinetic-type", name: "Strike-through kill", what: "a line scales across a word/number to cross it out", how: "a ::after bar; tl.fromTo(bar,{scaleX:0},{scaleX:1,duration:0.3,ease:'power2.in'},t)", when: "kill 'voicemail', an old cost, a myth" },
  { id: "type-ladder", group: "kinetic-type", name: "Type ladder (shout→whisper)", what: "a giant shout line then a small quiet line", how: "two .head lines, sizes 150px then 56px, revealed in sequence", when: "hook punch → context" },
  { id: "money-count-up", group: "data-viz", name: "Money count-up", what: "a dollar figure spins up and latches ($0 → $14,200)", how: "const o={v:0}; tl.to(o,{v:TARGET,duration:1.5,ease:'power1.out',onUpdate:()=>el.textContent='$'+Math.round(o.v).toLocaleString('en-US')},t)", when: "leak-math / recovered-money beats" },
  { id: "count-up-number", group: "data-viz", name: "Count-up number/percent", what: "a KPI spins up to a value with a suffix", how: "proxy {v:0}; tl.to(o,{v:N,onUpdate:()=>el.textContent=Math.round(o.v)+'%'},t)", when: "stat drops (64%, 90s, 3x)" },
  { id: "meter-fill", group: "data-viz", name: "Meter / progress bar", what: "a bar sweeps 0→X%", how: "a .bar with transform-origin:left; tl.fromTo(bar,{scaleX:0},{scaleX:pct,duration:0.8,ease:'power2.out'},t)", when: "speed, capacity, % improvement" },
  { id: "chart-draw", group: "data-viz", name: "Chart draw-on", what: "bars grow / a line path draws / a pie fills", how: "SVG stroke-dashoffset: tl.fromTo(path,{strokeDashoffset:LEN},{strokeDashoffset:0,duration:1,ease:'power2.out'},t); or bar scaleY", when: "benchmark / data-shock beats" },
  { id: "donut-ring", group: "data-viz", name: "Percentage ring / donut", what: "a donut arc fills to the stat (the '97%' look)", how: "SVG circle stroke-dasharray=circumference; tl.fromTo(circle,{strokeDashoffset:C},{strokeDashoffset:C*(1-pct),duration:1},t)", when: "one hero percentage" },
  { id: "equation-build", group: "data-viz", name: "Equation build", what: "mono chips dock one per beat (calls × job × close = $)", how: "chips as inline .eq spans; tl.fromTo(chip,{opacity:0,y:14},{opacity:1,y:0},t_i) staggered", when: "leak-math arithmetic" },
  // ── UI mockups (the viral weapon) ──
  { id: "crm-list", group: "ui-mockup", name: "CRM list rows", what: "a CRM card with lead rows + status text", how: ".crm card + .row flex; rows tl.fromTo({opacity:0,x:-20},{opacity:1,x:0},t_i) staggered", when: "database / pipeline / lead topics" },
  { id: "crm-row-wake", group: "ui-mockup", name: "CRM rows wake alive", what: "cold grey rows brighten to 'replied ✓ / booked ✓'", how: "tl.to(row,{opacity:0.4},coldT) then tl.fromTo(row,{opacity:0.3,scale:0.96},{opacity:1,scale:1,ease:'back.out(1.6)'},wakeT)", when: "reactivation / follow-up payoff" },
  { id: "sms-thread", group: "ui-mockup", name: "SMS / WhatsApp thread", what: "chat bubbles (them left / us right) pop in with the AI reply", how: ".bub.them / .bub.us; tl.fromTo(bub,{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,ease:'back.out(1.9)'},t_i)", when: "messaging / reminder / text-back topics" },
  { id: "phone-call-card", group: "ui-mockup", name: "Phone-call card", what: "a ringing call card stamps 'Missed' (red) or 'AI answered ✓' (green)", how: "card + stamp; tl.fromTo(stamp,{scale:0,rotation:-12},{scale:1,rotation:-8,ease:'back.out(2)'},t)", when: "missed-call / receptionist topics" },
  { id: "calendar-book", group: "ui-mockup", name: "Calendar self-booking", what: "an empty slot highlights → 'Booked ✓' → reminder ping", how: "grid cells; tl.fromTo(cell,{background:'#15181d'},{background:'#22c55e22'},t); check pops with back.out", when: "appointment / no-show topics" },
  { id: "dashboard-tiles", group: "ui-mockup", name: "Dashboard KPI tiles", what: "KPI cards count while bars rise", how: "tiles with count-up proxies + bar scaleY tweens staggered", when: "results / before-after proof" },
  { id: "inbox-clear", group: "ui-mockup", name: "Inbox badges clear", what: "unread badges (12) clear to 0 one by one", how: "badge count via proxy count-down; rows tl.to({opacity:0.4}) staggered", when: "inbox / DM management" },
  { id: "search-bar-type", group: "ui-mockup", name: "Search-bar type", what: "a query types into a search bar → answer box appears", how: "reveal query chars by stepping a clip-width tween; answer card fades/pops after", when: "SEO / AI-search visibility topics" },
  { id: "notification-toast", group: "ui-mockup", name: "Booking / win toast", what: "a green-dot toast slides in ('New booking ✓')", how: "tl.fromTo(toast,{opacity:0,y:40,scale:0.96},{opacity:1,y:0,scale:1,ease:'back.out(1.5)'},t)", when: "a win moment before the CTA" },
  { id: "comparison-split", group: "layout", name: "Comparison / VS split", what: "two columns ($4k receptionist vs one AI) with a VS", how: "two panels slide from behind centre: tl.fromTo(left,{x:-60,opacity:0},{x:0,opacity:1},t); mirror right", when: "comparison / cost-vs topics" },
  { id: "flowmap-nodes", group: "layout", name: "Flow-map nodes + connectors", what: "system nodes light up and connectors draw between them", how: "nodes pop (back.out); SVG connector stroke-dashoffset draws after each node", when: "'here's the flow' mechanism reveal" },
  { id: "step-circles", group: "data-viz", name: "Follow-up step circles", what: "numbered circles 1..5 with a 'SALE ✓' on the 5th", how: "circles static; the win circle tl.fromTo({scale:0.5},{scale:1,ease:'back.out(2.2)'},t)", when: "'most sales close after the 5th follow-up'" },
  // ── cuts / transitions ──
  { id: "hard-smash-cut", group: "cut-transition", name: "Hard smash cut", what: "0-frame scene swap — the default beat energy", how: "tl.set(prev,{autoAlpha:0},t); tl.set(next,{autoAlpha:1},t)", when: "every 1–2s beat" },
  { id: "scale-blur-settle", group: "cut-transition", name: "Scale+blur settle", what: "a scene enters slightly scaled + blurred and settles", how: "tl.fromTo(scene,{scale:1.05,filter:'blur(9px)'},{scale:1,filter:'blur(0px)',duration:0.22,ease:'power2.out'},inT); alternate scale up/down per scene", when: "scene entrances" },
  { id: "zoom-through", group: "cut-transition", name: "Zoom-through exit", what: "a scene scales up + blurs + fades on exit into the next", how: "tl.to(scene,{scale:1.6,filter:'blur(10px)',autoAlpha:0,duration:0.3},outT)", when: "act boundaries" },
  { id: "whip-pan", group: "cut-transition", name: "Whip-pan slide", what: "a directional translate + motion blur between scenes", how: "tl.fromTo(next,{xPercent:60,filter:'blur(8px)'},{xPercent:0,filter:'blur(0)',duration:0.26,ease:'power2.in'},t)", when: "lateral topic changes" },
  { id: "white-flash", group: "motion-impact", name: "White impact flash", what: "a single white frame punches on a heavy beat", how: "#flash{background:#fff;opacity:0}; tl.to(flash,{opacity:0.35,duration:0.05},t).to(flash,{opacity:0,duration:0.25},t+0.06)", when: "a shock / capture / slam beat" },
  // ── motion / impact / ambience ──
  { id: "shake-impact", group: "motion-impact", name: "Shake / impact", what: "a heavy word/number jitters", how: "tl.to(el,{x:'+=8',yoyo:true,repeat:5,duration:0.04},t) then reset", when: "a shock number" },
  { id: "scale-pulse", group: "motion-impact", name: "Scale pulse (capture)", what: "a 101–104% bump on the beat", how: "tl.to(el,{scale:1.04,yoyo:true,repeat:1,duration:0.4,ease:'sine.inOut'},t)", when: "CTA button, a landed word" },
  { id: "particle-burst", group: "motion-impact", name: "Particle / coin burst", what: "small particles pop out on a win", how: "seeded rnd() places N dots; tl.fromTo(dot,{scale:0,x:0,y:0},{scale:1,x:rnd()*range,y:rnd()*range,opacity:0,duration:0.5},t)", when: "money-recovered / win" },
  { id: "grain-vignette", group: "ambience", name: "Grain + vignette", what: "animated SVG-noise grain + radial vignette for cinematic depth (static overlays)", how: "#grain feTurbulence bg @ opacity .06 mix-blend overlay; #vign radial-gradient — no animation needed", when: "always — never a flat black" },
  { id: "radial-glow", group: "ambience", name: "Radial glow focal", what: "a soft light center behind the subject", how: "scene background: radial-gradient(85% 55% at 50% 36%, lighter, darker)", when: "every dark scene" },
  { id: "gradient-morph-bg", group: "ambience", name: "Gradient-morph background", what: "a slow background colour drift (seek-safe via a long tween)", how: "tl.to(scene,{'--a':'#...',duration:SCENE_LEN},inT) tweening a CSS var used in the gradient", when: "under-the-hood / ambient scenes" },
  { id: "cta-button", group: "ui-mockup", name: "CTA button", what: "a pill button pops in and pulses ('Book a free AI audit →')", how: "tl.fromTo(btn,{opacity:0,y:30,scale:0.9},{opacity:1,y:0,scale:1,ease:'back.out(1.8)'},t); then a yoyo scale pulse", when: "the signoff/CTA beat" },
];

/** The FULL library = the 218 real-reel effects + any core recipe not already present (deduped by id). */
export const EFFECT_LIBRARY: CatalogEffect[] = (() => {
  const byId = new Map<string, CatalogEffect>();
  for (const e of EFFECT_LIBRARY_DATA) byId.set(e.id, e);
  for (const e of CORE_EFFECTS) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
})();

const GROUP_ORDER: CatalogEffect["group"][] = ["kinetic-type", "ui-mockup", "data-viz", "cut-transition", "motion-impact", "ambience", "layout", "3d"];

/** CORE recipes with the full CSS+GSAP how (the animator can author these verbatim). */
function coreRecipes(): string {
  return GROUP_ORDER.filter((g) => CORE_EFFECTS.some((e) => e.group === g))
    .map((g) => `### ${g}\n${CORE_EFFECTS.filter((e) => e.group === g).map((e) => `  • ${e.name} — ${e.what}. HOW: ${e.how}${e.when ? ` (use: ${e.when})` : ""}`).join("\n")}`)
    .join("\n");
}

/** The FULL vocabulary as compact one-liners (name — what) grouped — so the animator KNOWS every technique. */
function fullVocabulary(): string {
  return GROUP_ORDER.filter((g) => EFFECT_LIBRARY.some((e) => e.group === g))
    .map((g) => {
      const items = EFFECT_LIBRARY.filter((e) => e.group === g).map((e) => `${e.name} (${e.what})`);
      return `### ${g} (${items.length})\n${items.join(" · ")}`;
    })
    .join("\n");
}

/** Assemble the full effect catalog string the animator sees (formats + style lanes + core recipes + the full 200+ library). */
export function reelEffectCatalog(): string {
  return [
    "FORMATS (pick the one that fits THIS topic): " + REEL_FORMATS.map((f) => f.name).join(" · "),
    "STYLE LANES (commit to ONE look): " + REEL_VARIETY_DIALS.styleLanes.map((l) => l.split(" — ")[0]).join(" · "),
    "ENGINE NOTE: " + REEL_RENDERABLE_CAPABILITIES.slice(3, 4).join(" "),
    `CORE EFFECTS with exact recipes (author these verbatim — the reliable backbone):\n${coreRecipes()}`,
    `THE FULL LIBRARY (${EFFECT_LIBRARY.length} techniques cataloged from real WOBBLE reels — compose MANY per reel, ≥10 across ≥4 groups; author any of them in the same seek-safe GSAP-on-the-master-timeline style; invent new ones too):\n${fullVocabulary()}`,
  ].join("\n\n");
}

export const EFFECT_LIBRARY_COUNT = EFFECT_LIBRARY.length;
