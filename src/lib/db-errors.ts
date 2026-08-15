/**
 * Reading what Postgres actually said, through the wrapper the driver puts around it.
 *
 * Drizzle raises a `DrizzleQueryError` whose message is "Failed query: insert into ..." and whose
 * `code` is undefined. The real error, with `code: '23505'` and "duplicate key value violates unique
 * constraint", is on `.cause`. So a check that only looks at the top-level error sees a unique
 * violation as an unknown failure.
 *
 * That is not theoretical. The live-operations guard treated it as unknown and threw, and the finance
 * module's copy of the same check would have stopped retrying a taken invoice number and stopped
 * treating a duplicate payment reference as already-recorded. Both read the top level only.
 *
 * One implementation, walking the cause chain, so the three places that need this cannot drift apart.
 */

/** How deep to follow `.cause`. Bounded so a self-referencing chain cannot spin. */
const MAX_DEPTH = 5;

function codesIn(error: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = error;
  for (let i = 0; i < MAX_DEPTH && cur; i++) {
    const code = (cur as { code?: string })?.code;
    if (typeof code === "string") out.push(code);
    const msg = cur instanceof Error ? cur.message : "";
    if (msg) out.push(msg.toLowerCase());
    cur = (cur as { cause?: unknown })?.cause;
  }
  return out;
}

/** True for a Postgres unique-constraint violation (23505), however deeply the driver wrapped it. */
export function isUniqueViolation(error: unknown): boolean {
  return codesIn(error).some((c) => c === "23505" || c.includes("duplicate key") || c.includes("unique constraint"));
}
