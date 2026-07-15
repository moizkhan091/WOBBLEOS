/**
 * Next.js server startup hook (WOB-AUD-017). Runs ONCE when the Node server boots. Validates the
 * runtime configuration and, in production, refuses to start on missing critical config (database,
 * session secret, shared-login hash) — a misconfigured deploy fails loudly instead of serving broken.
 */
export async function register(): Promise<void> {
  // Only the Node.js server runtime has the full env + can validate auth (bcrypt). Skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRuntimeConfig } = await import("@/lib/config/validate");
  assertRuntimeConfig(process.env, { context: "web" });
}
