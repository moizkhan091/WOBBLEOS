import { produceReel } from "@/lib/reel";

/**
 * Host proof of the FULL reel pipeline with the REAL ElevenLabs provider (no DB): Moiz voice → VO with
 * timestamps → word beats → 3-colour kinetic composition → chromium frame capture → ffmpeg mux (1.05x + loudnorm)
 * → a real MP4 under storage/media. Governance is satisfied off-DB (getSpent=0, no kill switches; the durable
 * ledger write is best-effort and safely skipped without a database). Set FULL=1 to render every frame.
 */

const MOIZ_GRAVEYARD = [
  "Your CRM is a graveyard.",
  "Hundreds of leads in there, stone cold — and you paid for every one.",
  "Here's the fix.",
  "An AI system texts your whole dead list, and books the ones who reply straight into your calendar.",
  "No new ad spend. Just money you already paid for, coming back.",
  "Want to see what's hiding in yours? Book a free AI audit.",
].join(" ");

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");
  const full = process.env.FULL === "1";
  const out = await produceReel(
    {
      narration: MOIZ_GRAVEYARD,
      voiceKey: "moiz",
      item: "reel-proof:crm-graveyard",
      maxFrames: full ? undefined : 60,
    },
    {
      // off-DB governance: nothing spent yet, no kill switches; ledger write is best-effort (skipped w/o a DB).
      getSpent: async () => 0,
      loadKillSwitches: async () => [],
    },
  );
  console.log(JSON.stringify({
    outputPath: out.outputPath,
    mediaRef: out.mediaRef,
    frames: out.frames,
    fps: out.fps,
    finalDurationSec: Number(out.finalDurationSec.toFixed(2)),
    speedUp: out.speedUp,
    voiceKey: out.voiceKey,
    words: out.words,
    scenes: out.scenes,
  }, null, 2));
  console.log("\n--- captions (SRT) ---\n" + out.captionsSrt.split("\n").slice(0, 12).join("\n"));
}

main().catch((e) => { console.error("PROVE-REEL FAILED:", e); process.exit(1); });
