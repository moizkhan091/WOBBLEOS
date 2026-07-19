/**
 * Reel voice roster + expression handling (from Phase-9 VOICE-SETTINGS.md). The founder selects the voice
 * before a reel is generated. Two rules, hard-locked:
 *  - MOIZ = eleven_multilingual_v2 ONLY, locked settings, NO expression tags (personality comes from the script
 *    + a 1.05x post-render speed-up). NEVER v3 (it stops sounding like him).
 *  - HALE / FEMALE = eleven_v3 EXPRESSIVE — the script MAY use [tags] (2-4 max, before the target phrase).
 *    v3 with-timestamps returns the [tags] AS characters, so captions MUST strip them.
 */

export interface ReelVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface ReelVoice {
  key: string;
  id: string;
  name: string;
  model: string; // eleven_multilingual_v2 | eleven_v3
  settings: ReelVoiceSettings;
  allowsExpressiveTags: boolean;
  /** post-render audio+video speed-up (ffmpeg setpts/atempo). Moiz = 1.05; v3 voices = 1.0. */
  speedUp: number;
}

export const REEL_VOICES: Record<string, ReelVoice> = {
  moiz: {
    key: "moiz",
    id: "512Jeow4Rpsq80q0SYn7",
    name: "Moiz",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.4, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    allowsExpressiveTags: false,
    speedUp: 1.05,
  },
  hale: {
    key: "hale",
    id: "wWWn96OtTHu1sn8SRGEr",
    name: "Hale (expressive)",
    model: "eleven_v3",
    settings: { stability: 0.5, use_speaker_boost: true },
    allowsExpressiveTags: true,
    speedUp: 1.0,
  },
  female: {
    key: "female",
    id: "OYTbf65OHHFELVut7v2H",
    name: "Female (expressive)",
    model: "eleven_v3",
    settings: { stability: 0.5, use_speaker_boost: true },
    allowsExpressiveTags: true,
    speedUp: 1.0,
  },
};

export const DEFAULT_REEL_VOICE = "moiz";

export function resolveReelVoice(key?: string): ReelVoice {
  return REEL_VOICES[(key ?? DEFAULT_REEL_VOICE).toLowerCase()] ?? REEL_VOICES[DEFAULT_REEL_VOICE];
}

/** The client-approved v3 expression tag set (VOICE-SETTINGS.md). [short pause]/[long pause] allowed; NO plain [pause]. */
export const REEL_EXPRESSION_TAGS = [
  "laughs", "laughing", "whispers", "whisper", "sighs", "excited", "sad", "angry", "annoyed", "thoughtful",
  "surprised", "sarcastic", "mischievously", "crying", "confident", "curious", "deadpan", "scoffs", "chuckles",
  "clears throat", "exhales sharply", "inhales deeply", "short pause", "long pause", "slow",
];

/** Strip [expression tags] from text — the clean spoken words (for captions + for the v2 path which forbids tags). */
export function stripExpressionTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Narration guidance for the LLM per voice: whether it MAY use expressive tags, and which. */
export function reelNarrationGuidance(voice: ReelVoice): string {
  if (!voice.allowsExpressiveTags) {
    return `VOICE = ${voice.name} (eleven_multilingual_v2). Write natural, punchy spoken narration. DO NOT use any [expression tags] or [pause] — this voice's energy comes from the words and pacing, not tags.`;
  }
  return `VOICE = ${voice.name} (eleven_v3, expressive). Write natural, conversational narration. You MAY place 2-4 inline [expression tags] right before the phrase they affect (each affects ~4-5 words). Allowed tags: ${REEL_EXPRESSION_TAGS.map((t) => `[${t}]`).join(" ")}. Lean on emotion + pacing ([confident] [excited] [sarcastic] [thoughtful] [short pause] [slow]); use SFX-style tags rarely. NEVER use a plain [pause] (it makes it boring). Do not stack conflicting tags.`;
}

// ── Timestamp alignment → tag-stripped word timings (for caption sync) ─────────────────────────────────

export interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/**
 * Turn ElevenLabs character-level alignment into WORD timings for captions — SKIPPING everything inside [ ]
 * (the v3 expression tags come back as characters and must never appear on screen). Per-word sync preserved.
 */
export function alignmentToWords(a: CharAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let cur = "";
  let start = -1;
  let end = -1;
  let inTag = false;
  const flush = () => {
    if (cur.trim()) words.push({ word: cur, start: start < 0 ? 0 : start, end });
    cur = "";
    start = -1;
    end = -1;
  };
  const chars = a.characters ?? [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "[") { inTag = true; continue; }
    if (ch === "]") { inTag = false; continue; }
    if (inTag) continue;
    if (/\s/.test(ch)) { flush(); continue; }
    if (start < 0) start = a.character_start_times_seconds?.[i] ?? 0;
    end = a.character_end_times_seconds?.[i] ?? end;
    cur += ch;
  }
  flush();
  return words;
}
