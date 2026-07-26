/**
 * WOBBLE OS — Eval runner (deterministic CI tier).
 * ================================================
 *
 * Run with:  npm run eval        (-> tsx scripts/run-evals.ts)
 *
 * WHAT THIS DOES
 * --------------
 * Loads the golden set (src/lib/evals/cases) and runs the DETERMINISTIC assertion
 * tier against a STUBBED producer that replays the recorded fixture outputs. That
 * makes this command:
 *   - FREE      — no provider is ever called, so it can't touch the OpenRouter balance;
 *   - OFFLINE   — no DB, no network;
 *   - REPRODUCIBLE — same inputs, same outputs, every run.
 * It prints a pass/fail summary and EXITS NON-ZERO on any failure, so CI can gate on it.
 *
 * WHY THE DETERMINISTIC TIER IS THE GATE
 * --------------------------------------
 * Brand-voice and structural regressions (a banned phrase creeping back in, a JSON
 * shape breaking, citations disappearing) are exactly the failures you want caught on
 * every push — cheaply and without flakiness. The subjective "is this GOOD?" judgement
 * is real but costs money and is non-deterministic, so it is deliberately kept OFF here.
 *
 * ----------------------------------------------------------------------------------
 * HOW TO ENABLE THE LIVE-LLM + JUDGE TIERS LATER (opt-in, costs money)
 * ----------------------------------------------------------------------------------
 * 1. LIVE PRODUCER — replace `replayProducer()` with a real generator, e.g.:
 *
 *        import { runTextProvider } from "@/lib/providers";
 *        const produce = async (input: unknown) => {
 *          const res = await runTextProvider({ ...buildRequestFrom(input) });
 *          return res.text;
 *        };
 *
 *    Then the SAME deterministic assertions grade real model output.
 *
 * 2. LLM JUDGE — pass a `judge` in the run options so `llm_judge` assertions run
 *    instead of being skipped:
 *
 *        const judge = async (prompt: string) => {
 *          const res = await runTextProvider({ messages: [{ role: "user", content: prompt }] });
 *          return parseJudgeVerdict(res.text); // -> { score, pass, reason }
 *        };
 *        await runSuite(goldenCases, produce, { judge });
 *
 *    Gate these behind an env flag (e.g. `EVAL_LIVE=1`) so they never run in normal CI.
 * ----------------------------------------------------------------------------------
 */

import { runSuite, type EvalSuiteSummary } from "../src/lib/evals/harness";
import { goldenCases, replayProducer } from "../src/lib/evals/cases/index";

function printSummary(summary: EvalSuiteSummary): void {
  console.log("\nWOBBLE OS — Eval harness (deterministic tier)\n");

  for (const result of summary.results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  [${status}] ${result.caseId}`);
    for (const failure of result.failures) {
      console.log(`         - ${failure}`);
    }
    for (const skip of result.skipped) {
      console.log(`         ~ skipped: ${skip}`);
    }
  }

  console.log(
    `\n  ${summary.passed}/${summary.total} passed` +
      (summary.failed ? `, ${summary.failed} failed` : "") +
      (summary.skipped ? `  (${summary.skipped} assertion(s) skipped — judge tier is opt-in)` : ""),
  );
}

async function main(): Promise<void> {
  // Deterministic tier: NO judge injected -> any `llm_judge` assertions are SKIPPED, not failed.
  const summary = await runSuite(goldenCases, replayProducer());
  printSummary(summary);

  if (summary.failed > 0) {
    console.error(`\nEval FAILED: ${summary.failed} case(s) did not pass.\n`);
    process.exit(1);
  }
  console.log("\nEval PASSED: all cases green.\n");
}

main().catch((error: unknown) => {
  console.error("Eval runner crashed:", error);
  process.exit(1);
});
