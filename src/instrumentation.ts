/**
 * Next.js server startup hook (WOB-AUD-017). Runs ONCE when the Node server boots. Validates the
 * runtime configuration and, in production, refuses to start on missing critical config (database,
 * session secret) — a misconfigured deploy fails loudly instead of serving broken. Founder credentials
 * are not env config: they live in Postgres, set by `npm run auth:bootstrap`.
 */
export async function register(): Promise<void> {
  // Only the Node.js server runtime has the full env + can validate auth (bcrypt). Skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRuntimeConfig } = await import("@/lib/config/validate");
  assertRuntimeConfig(process.env, { context: "web" });
}
