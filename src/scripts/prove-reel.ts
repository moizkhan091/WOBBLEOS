import { produceReel, type ReelTextProvider } from "@/lib/reel";

/** Direct OpenRouter caller (cheap model) — drives the writer + director LIVE without the DB governance layer,
 *  so the host proof exercises the REAL agents. Costs a fraction of a cent per reel on gpt-4o-mini. */
const CHEAP_MODEL = process.env.REEL_LLM_MODEL ?? "openai/gpt-4o-mini";
const liveProvider: ReelTextProvider = async ({ messages, temperature, maxTokens, model }) => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: model ?? CHEAP_MODEL, messages, temperature: temperature ?? 0.7, max_tokens: maxTokens ?? 1600 }),
  });
  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: json.choices?.[0]?.message?.content ?? "" };
};

/**
 * Host proof of the FULL reel pipeline with the REAL ElevenLabs provider (no DB): Moiz voice → VO with
 * timestamps → the DIRECTOR designs a per-topic scene plan (backgrounds, accents, topic-specific mockups) → the
 * plan is anchored to the real word beats → chromium frame capture → ffmpeg mux (1.05x + loudnorm + music) → a
 * real MP4 under storage/media. Governance is satisfied off-DB (getSpent=0, no kill switches). Set FULL=1 to
 * render every frame.
 *
 * The DIRECTOR normally calls the writer LLM (OpenRouter, currently 402). To prove the director→map→render→mockup
 * path without it, a scripted director stands in: it reads the numbered words from the REAL prompt and returns a
 * topic-specific plan (dead-lead Kanban on the hook, a booking toast on the fix). This exercises the true code
 * path — buildReelDirectorPrompt → runProvider → parseDirectedPlan → mapDirectedScenes — just with a canned LLM.
 */

const MOIZ_GRAVEYARD = [
  "Your CRM is a graveyard.",
  "Hundreds of leads in there, stone cold — and you paid for every one.",
  "Here's the fix.",
  "An AI system texts your whole dead list, and books the ones who reply straight into your calendar.",
  "No new ad spend. Just money you already paid for, coming back.",
  "Want to see what's hiding in yours? Book a free AI audit.",
].join(" ");

/** A scripted stand-in for the director LLM: parses the numbered words from the prompt, builds ~4-word scenes,
 *  and attaches THIS topic's mockups (a stalled-lead Kanban up front, a booking toast near the fix). */
const scriptedDirector: ReelTextProvider = async ({ messages }) => {
  const rawUser = messages.find((m) => m.role === "user")?.content ?? "";
  const user = typeof rawUser === "string" ? rawUser : "";
  const block = user.split("reference these indices:")[1] ?? user;
  const nums = [...block.matchAll(/(\d+):(\S+)/g)].map((m) => ({ i: Number(m[1]), w: m[2] }));
  const n = nums.length;
  const scenes: Record<string, unknown>[] = [];
  let idx = 0;
  let si = 0;
  while (idx < n) {
    const to = Math.min(n, idx + 4);
    const words = nums.slice(idx, to).map((x) => x.w);
    const painIdx = words.findIndex((w) => /graveyard|cold|dead|paid/i.test(w));
    const isLast = to >= n;
    const scene: Record<string, unknown> = {
      fromWord: idx,
      toWord: to,
      bg: si === 0 ? "dark" : isLast ? "blue" : si < 3 ? "dark" : "light",
      accents: painIdx >= 0 ? [{ word: words[painIdx].replace(/[^A-Za-z]/g, ""), color: "orange" }] : [],
    };
    if (si === 0) {
      scene.mockup = {
        kind: "kanban",
        columns: [
          { title: "NEW", cards: [{ name: "Fresh lead", meta: "today", chip: "new" }] },
          { title: "STALLED", cards: [{ name: "R. Khan", meta: "Roofing · 41d", chip: "stuck" }, { name: "S. Ali", meta: "HVAC · 33d", chip: "late" }] },
        ],
      };
    } else if (/texts|books|calendar|reply/i.test(words.join(" "))) {
      scene.mockup = { kind: "chat", header: "AI · reactivation", bubbles: [{ from: "us", text: "Hi Sara — still looking to get that roof quote?" }, { from: "them", text: "Yes! This week works." }, { from: "us", text: "Booked you Sat 2:00 PM ✓" }] };
    } else if (isLast) {
      scene.mockup = { kind: "notification", title: "New booking", body: "Sat 2:00 PM — from a dead lead" };
    }
    scenes.push(scene);
    idx = to;
    si++;
  }
  return { text: JSON.stringify({ scenes }) };
};

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");
  const full = process.env.FULL === "1";
  const live = process.env.LIVE_LLM === "1"; // real writer + director on a cheap OpenRouter model
  const out = await produceReel(
    {
      // LIVE: let the WRITER draft the narration from the topic (proves the writer knows the craft). OFFLINE: supply it.
      narration: live ? undefined : MOIZ_GRAVEYARD,
      topic: "Your dead CRM database is a goldmine",
      angle: "reactivate cold leads with an AI text system",
      voiceKey: "moiz",
      item: "reel-proof:crm-graveyard",
      maxFrames: full ? undefined : 90,
    },
    {
      getSpent: async () => 0,
      loadKillSwitches: async () => [],
      // LIVE: real cheap-model LLM for writer + director. OFFLINE: scripted director (no LLM credit needed).
      runProvider: live ? liveProvider : scriptedDirector,
    },
  );
  console.log(JSON.stringify({
    mode: live ? "LIVE (gpt-4o-mini writer+director)" : "offline (scripted director)",
    outputPath: out.outputPath,
    mediaRef: out.mediaRef,
    frames: out.frames,
    finalDurationSec: Number(out.finalDurationSec.toFixed(2)),
    speedUp: out.speedUp,
    voiceKey: out.voiceKey,
    words: out.words,
    scenes: out.scenes,
    mockups: out.mockups,
    directed: out.directed,
    authored: out.authored,
  }, null, 2));
  console.log("\n--- narration ---\n" + out.narration);
}

main().catch((e) => { console.error("PROVE-REEL FAILED:", e); process.exit(1); });
