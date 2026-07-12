/**
 * CI-ONLY DETERMINISTIC JUDGMENT ADAPTER — NOT PRODUCTION, NOT PROOF OF THE LIVE PROVIDER PATH.
 *
 * Every commercial-chain vertical runs exactly ONE advisory LLM judgment step (proposal synthesis, deal-risk,
 * margin, delivery feasibility). Those steps are ADVISORY ONLY — they never sit on a financial/CRM/project
 * write path. The required Playwright gate must not make live paid LLM calls, so when the E2E web server sets
 * `WOBBLE_JUDGMENT_ADAPTER=deterministic` each default judgment returns a fixed, benign result instead of
 * calling the provider. Properties, by construction:
 *   - CI-only    — enabled solely by the isolated E2E web-server env (never a real deploy),
 *   - deterministic — the same benign advisory every run,
 *   - non-production — real deployments leave the flag unset and use the real provider,
 *   - NOT proof of the live OpenRouter provider path — that is covered by the real-OpenRouter smoke proofs
 *     (`npm run verify:provider-usage` / the L1 real-provider proof), which stay separate and must keep passing.
 *
 * The advisory nature is preserved: a deterministic "low risk / clear" result changes no write, only the
 * advisory annotation the founder sees. It exists so the browser gate can drive the REAL production execution
 * path (real handoff runtime, real consumer, real deterministic CRM/Finance/Delivery writes) end-to-end.
 */
export function useDeterministicJudgment(): boolean {
  return process.env.WOBBLE_JUDGMENT_ADAPTER === "deterministic";
}
