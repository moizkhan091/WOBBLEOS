import { isAuthConfigured } from "@/lib/auth";

/**
 * Startup runtime-config validation (WOB-AUD-017).
 *
 * Fails fast on MISSING CRITICAL config in production (no database, no session secret, no shared-login
 * hash) so a misconfigured deploy stops loudly instead of serving a broken/insecure app. Soft config
 * (durable storage path, public base URL) produces warnings — those features degrade honestly rather
 * than crash the process. Pure + injectable so it is unit-tested without real env.
 */

export interface ConfigCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigCheckOptions {
  context: "web" | "worker";
  /** Treat as production regardless of NODE_ENV (tests). Defaults to NODE_ENV === "production". */
  production?: boolean;
}

export function validateRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
  opts: ConfigCheckOptions = { context: "web" },
): ConfigCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = opts.production ?? env.NODE_ENV === "production";

  // --- Critical (hard errors in production) ---
  if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
    (production ? errors : warnings).push("DATABASE_URL is not set — the app cannot reach Postgres.");
  }

  // Auth config (session secret + shared-login hash) is required for the web app to authenticate anyone.
  if (opts.context === "web" && !isAuthConfigured(env)) {
    const detail =
      !env.SESSION_SECRET || env.SESSION_SECRET.length < 16
        ? "SESSION_SECRET is missing or shorter than 16 chars"
        : "SHARED_LOGIN_PASSWORD_HASH(_B64) is missing or not a bcrypt hash";
    (production ? errors : warnings).push(`auth is not configured (${detail}) — login will fail.`);
  }

  // --- Soft (warnings; features degrade) ---
  if (production && (!env.STORAGE_ROOT || !env.STORAGE_ROOT.trim())) {
    warnings.push("STORAGE_ROOT is not set — media/storage falls back to an EPHEMERAL in-container path (lost on container replacement). Mount a durable volume and set STORAGE_ROOT.");
  }
  if (production && (!env.PUBLIC_BASE_URL || !env.PUBLIC_BASE_URL.trim())) {
    warnings.push("PUBLIC_BASE_URL is not set — external media publishing + outbound webhook callbacks are inert until it is configured.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Log the result; throw on hard errors so a production process refuses to start misconfigured. */
export function assertRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
  opts: ConfigCheckOptions = { context: "web" },
  log: Pick<Console, "warn" | "error"> = console,
): ConfigCheckResult {
  const result = validateRuntimeConfig(env, opts);
  for (const w of result.warnings) log.warn(`[config] WARN: ${w}`);
  if (!result.ok) {
    for (const e of result.errors) log.error(`[config] ERROR: ${e}`);
    throw new Error(`invalid runtime configuration (${opts.context}): ${result.errors.join("; ")}`);
  }
  return result;
}
