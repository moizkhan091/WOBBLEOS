import type { WordTiming } from "@/lib/domain/reel-voice";
import type { ReelScene, ReelBg, ReelAccent, ReelMockup, ReelChip } from "@/lib/domain/reel-composition";
import { reelDirectorKnowledge } from "@/lib/domain/reel-knowledge";

/**
 * Reel DIRECTOR — the agent brief + the deterministic mapping that turns an LLM's per-topic scene plan into a
 * concrete ReelScene[] anchored to the REAL ElevenLabs word timings. This is the "the AI team knows how to make
 * a reel" piece: instead of dropping a hardcoded UI mockup onto every reel (which would look templated and
 * reused), the director reads THIS topic + THIS narration and decides — per beat — the background, the accent
 * words, and whether a mockup belongs and what topic-specific content goes inside it. The director never invents
 * timing: it references spoken WORD INDICES, and the mapper looks up each index's real start time, so words +
 * mockups always land on the beat. If the LLM is unavailable or its output is unusable, the caller falls back to
 * the deterministic planner — the reel still renders, just as pure kinetic typography.
 */

export interface DirectedAccent {
  word: string; // a spoken word within the scene to accent (matched case-insensitively, punctuation-tolerant)
  color?: ReelAccent; // orange = pain, blue = fix/brand, lime = highlight
}
export interface DirectedScene {
  fromWord: number; // index into the words[] array where this scene starts
  toWord: number; // exclusive end index (defaults to next scene's fromWord / end of reel)
  bg?: ReelBg;
  size?: "sm" | "" | "xl";
  accents?: DirectedAccent[];
  mockup?: unknown; // free-form; coerced to a ReelMockup (topic-specific content the LLM filled)
}
export interface DirectedPlan {
  scenes: DirectedScene[];
}

const MOCKUP_KINDS = new Set(["kanban", "metrics", "chat", "notification"]);
const CHIPS: ReelChip[] = ["hot", "stuck", "late", "new", "won", "ok"];
const ACCENTS: ReelAccent[] = ["blue", "orange", "lime", "dim", "ink"];
const BGS: ReelBg[] = ["dark", "light", "blue", "signoff"];

function str(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Coerce free-form LLM mockup JSON into a strict ReelMockup (or undefined if it isn't a usable mockup). */
export function coerceMockup(raw: unknown): ReelMockup | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as Record<string, unknown>;
  const kind = typeof m.kind === "string" ? m.kind.toLowerCase() : "";
  if (!MOCKUP_KINDS.has(kind)) return undefined;
  if (kind === "kanban") {
    const columns = arr(m.columns).slice(0, 3).map((c) => {
      const col = (c ?? {}) as Record<string, unknown>;
      return {
        title: str(col.title, 24) ?? "",
        cards: arr(col.cards).slice(0, 4).map((cd) => {
          const card = (cd ?? {}) as Record<string, unknown>;
          const chip = typeof card.chip === "string" ? (card.chip.toLowerCase() as ReelChip) : undefined;
          return { name: str(card.name, 40) ?? "", meta: str(card.meta, 40), chip: chip && CHIPS.includes(chip) ? chip : undefined };
        }).filter((cd) => cd.name),
      };
    }).filter((c) => c.title || c.cards.length);
    return columns.length ? { kind: "kanban", columns } : undefined;
  }
  if (kind === "metrics") {
    const tiles = arr(m.tiles).slice(0, 3).map((t) => {
      const tile = (t ?? {}) as Record<string, unknown>;
      const accent = typeof tile.accent === "string" ? (tile.accent.toLowerCase() as ReelAccent) : undefined;
      const countTo = typeof tile.countTo === "number" ? tile.countTo : typeof tile.countTo === "string" ? Number(tile.countTo) : undefined;
      return { value: str(tile.value, 12) ?? "", label: str(tile.label, 40) ?? "", countTo: Number.isFinite(countTo) ? (countTo as number) : undefined, accent: accent && ACCENTS.includes(accent) ? accent : undefined };
    }).filter((t) => t.value);
    return tiles.length ? { kind: "metrics", tiles } : undefined;
  }
  if (kind === "chat") {
    const bubbles = arr(m.bubbles).slice(0, 5).map((b) => {
      const bub = (b ?? {}) as Record<string, unknown>;
      const from = bub.from === "us" ? "us" : "them";
      return { from: from as "us" | "them", text: str(bub.text, 90) ?? "" };
    }).filter((b) => b.text);
    return bubbles.length ? { kind: "chat", header: str(m.header, 40), bubbles } : undefined;
  }
  // notification
  const title = str(m.title, 48);
  return title ? { kind: "notification", title, body: str(m.body, 80) } : undefined;
}

/** Normalise a word for accent matching (lowercase, strip surrounding punctuation). */
function normWord(w: string): string {
  return w.toLowerCase().replace(/^[^a-z0-9$%]+|[^a-z0-9$%]+$/g, "");
}

/**
 * Deterministically turn a directed plan into concrete scenes anchored to the real VO word timings. Timing is
 * NEVER taken from the LLM — each scene's in/out is the spoken start time of its first/next word, so words +
 * mockups land exactly on the beat. Scenes are clamped, ordered, and gap-filled; an empty/garbage plan yields [].
 */
export function mapDirectedScenes(plan: DirectedPlan, words: WordTiming[], durationSec: number): ReelScene[] {
  if (!words.length) return [];
  const raw = arr(plan?.scenes)
    .map((s) => s as DirectedScene)
    .filter((s) => Number.isFinite(s.fromWord))
    .map((s) => ({ ...s, fromWord: Math.max(0, Math.min(words.length - 1, Math.floor(s.fromWord))) }))
    .sort((a, b) => a.fromWord - b.fromWord);
  if (!raw.length) return [];

  const out: ReelScene[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const from = s.fromWord;
    // end at the explicit toWord if sane, else the next scene's start, else the last word.
    const nextFrom = i + 1 < raw.length ? raw[i + 1].fromWord : words.length;
    let to = Number.isFinite(s.toWord) ? Math.floor(s.toWord) : nextFrom;
    if (to <= from) to = nextFrom;
    to = Math.max(from + 1, Math.min(words.length, to));
    const sceneWords = words.slice(from, to);
    if (!sceneWords.length) continue;

    const accentMap = new Map<string, ReelAccent>();
    for (const a of arr(s.accents) as DirectedAccent[]) {
      const key = normWord(str(a?.word) ?? "");
      const color = typeof a?.color === "string" && ACCENTS.includes(a.color) ? a.color : "blue";
      if (key) accentMap.set(key, color);
    }

    const inT = sceneWords[0].start;
    const outT = to < words.length ? words[to].start : durationSec;
    const bg = s.bg && BGS.includes(s.bg) ? s.bg : "dark";
    const size = s.size === "sm" || s.size === "xl" || s.size === "" ? s.size : sceneWords.length <= 2 ? "xl" : sceneWords.length >= 6 ? "sm" : "";
    out.push({
      bg,
      in: inT,
      out: outT,
      mockup: coerceMockup(s.mockup),
      lines: [{ words: sceneWords.map((w) => ({ text: w.word, t: w.start, accent: accentMap.get(normWord(w.word)) })), size }],
    });
  }
  if (!out.length) return [];
  // ensure the plan spans the whole reel (first starts at 0-ish, last ends at duration).
  out[0].in = Math.min(out[0].in, words[0].start);
  out[out.length - 1].out = durationSec;
  return out;
}

/** The director's brief + the numbered word list, asking for a topic-specific scene plan as strict JSON. */
export function buildReelDirectorPrompt(input: { topic: string; angle?: string; narration: string; words: WordTiming[] }): { system: string; user: string } {
  const numbered = input.words.map((w, i) => `${i}:${w.word}`).join(" ");
  const system = [
    reelDirectorKnowledge(),
    "# YOUR TASK",
    "You are the WOBBLE REEL DIRECTOR. Turn this chosen topic + its already-recorded voiceover into a per-beat visual plan, applying the craft above. Pick the format + style lane that fit THIS topic; open on a pattern-interrupt; keep the 3-colour narrative (dark PROBLEM → cream EXPLAIN → blue FIX/CTA); accent ONE word per line (orange = pain, blue = fix/brand, lime = highlight).",
    "MOCKUPS ARE MANDATORY. They are our single biggest retention weapon — a reel that is only text is a FAILURE. Include 1–2 mockups, on explain/proof beats (NEVER the hook or the final CTA), each filled with THIS topic's REAL content (never generic placeholder). Choose the kind that fits the topic:",
    "  • kanban — CRM pipeline. columns[].title + cards[].{name,meta,chip}. chips: hot|stuck|late|new|won|ok. For database/pipeline/lead-rot topics (show cold, STUCK, LATE leads).",
    "  • metrics — 1–3 KPI tiles. tiles[].{value,label,countTo?,accent?}. countTo (a number) makes the figure count up — USE IT for any dollar/percent/number the narration says (e.g. value:'$5,000' countTo:5000 label:'lost every month').",
    "  • chat — SMS/WhatsApp thread. bubbles[].{from:'them'|'us',text}. For messaging/reminder/reactivation topics — show the AI's real replies.",
    "  • notification — a win toast. {title, body?}. For a booking/won moment (title:'New booking', body:'Sat 2:00 PM — confirmed').",
    "Anchor every scene to the SPOKEN WORDS by index (fromWord/toWord, referencing the numbered list). Do NOT set times — indices only; the system maps them to the real beats. Cover ALL the words in order with no gaps. Break on sentence boundaries; keep 2–6 words per scene.",
    "Return ONLY strict JSON: {\"scenes\":[...]}, no prose, no markdown. WORKED EXAMPLE (topic: dead CRM database → note the two mockups):",
    '{"scenes":[' +
      '{"fromWord":0,"toWord":5,"bg":"dark","accents":[{"word":"graveyard","color":"orange"}]},' +
      '{"fromWord":5,"toWord":11,"bg":"dark","accents":[{"word":"cold","color":"orange"}],"mockup":{"kind":"kanban","columns":[{"title":"NEW","cards":[{"name":"Fresh lead","meta":"today","chip":"new"}]},{"title":"STALLED","cards":[{"name":"R. Khan","meta":"Roofing · 41d","chip":"stuck"},{"name":"S. Ali","meta":"HVAC · 33d","chip":"late"}]}]}},' +
      '{"fromWord":11,"toWord":17,"bg":"light","accents":[{"word":"5,000","color":"orange"}],"mockup":{"kind":"metrics","tiles":[{"value":"$5,000","countTo":5000,"label":"lost every month","accent":"orange"}]}},' +
      '{"fromWord":17,"toWord":23,"bg":"blue","accents":[{"word":"AI","color":"lime"}]}' +
      "]}",
  ].join("\n");
  const user = `Topic: ${input.topic}${input.angle ? `\nAngle: ${input.angle}` : ""}\n\nNarration (already voiced): ${input.narration}\n\nSpoken words (index:word) — reference these indices:\n${numbered}\n\nReturn the scene plan JSON now.`;
  return { system, user };
}

/** Tolerant JSON extraction for the director's reply (handles ```json fences + surrounding prose). */
export function parseDirectedPlan(text: string): DirectedPlan | null {
  if (!text) return null;
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(body.slice(start, end + 1)) as DirectedPlan;
    return obj && Array.isArray(obj.scenes) ? obj : null;
  } catch {
    return null;
  }
}
