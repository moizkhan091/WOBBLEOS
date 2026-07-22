import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Production environment-template guard (release-candidate hardening).
 *
 * Failure mode this prevents: production code reads `process.env.SOMETHING`, but the production
 * template (.env.production.example) never mentions it — so the operator filling in the template has
 * no way to know the variable exists, and the capability silently stays off in production (exactly
 * what happened with APIFY_API_TOKEN vs APIFY_API_KEY). This test statically inventories every
 * `process.env.X` in production source and fails when one is neither documented in the template nor
 * on the explicit, reasoned exemption list below.
 *
 * It also pins the two naming decisions:
 *   - APIFY_API_TOKEN is the canonical Apify var (APIFY_API_KEY only as a code-level legacy alias —
 *     the template must present the canonical name);
 *   - the retired shared-login secret must never reappear in the template (auth is per-founder
 *     Postgres accounts via `npm run auth:bootstrap`).
 */

const ROOT = process.cwd();
// Production source: what actually runs on the VPS. src/scripts (verify proofs) and tests are not production.
const PROD_DIRS = ["src/lib", "src/app", "src/workers", "src/db", "src/components"];

/**
 * Vars production code reads that are deliberately NOT in the template. Every entry needs a reason:
 *   - runtime-internal: set by the platform/compose, never by the operator's env file;
 *   - tuning-with-default: optional knob with a safe built-in default, documented in code;
 *   - legacy-alias: accepted for backward compatibility, canonical name is documented instead;
 *   - dev-only: only meaningful on a dev laptop, never in production.
 */
const EXEMPT: Record<string, string> = {
  NODE_ENV: "runtime-internal — set by Next/Node, not the operator",
  WOBBLE_BUILD_ID: "runtime-internal — stamped by scripts/deploy.sh + docker-compose.prod.yml at build time",
  APIFY_API_KEY: "legacy-alias — canonical APIFY_API_TOKEN is documented in the template",
  FAL_API_KEY: "legacy-alias — canonical FAL_KEY is documented in the template",
  SESSION_COOKIE_INSECURE: "dev-only — allows http cookies on localhost; must never be set in production",
  FFMPEG_PATH: "tuning-with-default — resolved from PATH when unset",
  REEL_MUSIC_BED: "dev-only — parked reel pipeline asset override",
  WOBBLE_BRAND_REF_ROOT: "tuning-with-default — brand reference folder, defaults inside the repo",
  WOBBLE_JUDGMENT_ADAPTER: "tuning-with-default — selects the judgment adapter, safe default",
  JOB_LEASE_MS: "tuning-with-default — worker lease duration (120s default)",
  JOBS_RETENTION_DAYS: "tuning-with-default — terminal-job retention (14d default)",
  MEDIA_WORKER_POLL_MS: "tuning-with-default — media worker poll interval",
  WORKER_SHUTDOWN_DEADLINE_MS: "tuning-with-default — graceful-shutdown bound (25s default)",
  PROPOSAL_EXPIRY_DAYS: "tuning-with-default — proposal validity window (30d default)",
  PG_POOL_MAX: "tuning-with-default — pg pool sizing",
  PG_CONNECT_TIMEOUT_MS: "tuning-with-default — pg connect timeout",
  PG_IDLE_TIMEOUT_MS: "tuning-with-default — pg idle timeout",
  PG_STATEMENT_TIMEOUT_MS: "tuning-with-default — pg statement timeout",
  APIFY_WEBSITE_ACTOR: "tuning-with-default — well-known actor id built in",
  APIFY_INSTAGRAM_ACTOR: "tuning-with-default — well-known actor id built in",
  DEFAULT_MODEL: "tuning-with-default — role/model map seeded in DB; env override only",
  // Per-role model overrides: all optional; the seeded role map is the real source of truth.
  ASK_WOBBLE_MODEL: "tuning-with-default — per-role model override",
  AUDIT_DISCOVERY_MODEL: "tuning-with-default — per-role model override",
  AUDIT_INTERVIEW_PLANNER_MODEL: "tuning-with-default — per-role model override",
  AUDIT_OPPORTUNITY_MODEL: "tuning-with-default — per-role model override",
  AUDIT_PRIORITIZATION_MODEL: "tuning-with-default — per-role model override",
  AUDIT_REPORT_MODEL: "tuning-with-default — per-role model override",
  AUDIT_ROADMAP_MODEL: "tuning-with-default — per-role model override",
  CONTENT_COPYWRITING_MODEL: "tuning-with-default — per-role model override",
  CONTENT_RESEARCH_MODEL: "tuning-with-default — per-role model override",
  CONTENT_SCORING_MODEL: "tuning-with-default — per-role model override",
  CONTENT_STRATEGY_MODEL: "tuning-with-default — per-role model override",
  KNOWLEDGE_COMPILER_MODEL: "tuning-with-default — per-role model override",
  MEMORY_ROUTER_MODEL: "tuning-with-default — per-role model override",
  PITCH_WRITER_MODEL: "tuning-with-default — per-role model override",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function envVarsUsedInProduction(): Set<string> {
  const vars = new Set<string>();
  const re = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  for (const dir of PROD_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) vars.add(m[1]);
    }
  }
  return vars;
}

// Also count vars read via the `env.X` pattern of injectable readers (readPlausibleConfig,
// build/version.ts) whose default is process.env — production-read without a literal `process.env.X`.
const INJECTED_ENV_READS = ["PLAUSIBLE_API_KEY", "PLAUSIBLE_SITE_ID", "PLAUSIBLE_HOST", "WOBBLE_BUILD_ID"];

function templateVars(file: string): Set<string> {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const vars = new Set<string>();
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (m) vars.add(m[1]);
  }
  return vars;
}

const SCAN_TIMEOUT_MS = 30_000;

describe("production env template coverage", () => {
  const used = envVarsUsedInProduction();
  for (const v of INJECTED_ENV_READS) used.add(v);
  const template = templateVars(".env.production.example");

  it("scans a realistic amount of production source", () => {
    expect(used.size).toBeGreaterThan(20);
  });

  it("every production-read env var is documented in .env.production.example or explicitly exempted with a reason", () => {
    const undocumented = [...used].filter((v) => !template.has(v) && !(v in EXEMPT)).sort();
    expect(
      undocumented,
      `these env vars are read by production code but absent from .env.production.example (add them there, or add an EXEMPT entry with a real reason):\n${undocumented.join("\n")}`,
    ).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("every exemption still corresponds to a var production code actually reads (no stale exemptions)", () => {
    const stale = Object.keys(EXEMPT).filter((v) => !used.has(v)).sort();
    expect(stale, `stale EXEMPT entries (production no longer reads them — remove):\n${stale.join("\n")}`).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("the template documents the CANONICAL Apify var, not the legacy alias", () => {
    expect(template.has("APIFY_API_TOKEN"), "template must document APIFY_API_TOKEN").toBe(true);
    expect(template.has("APIFY_API_KEY"), "template must not present the legacy APIFY_API_KEY as the name to fill").toBe(false);
  });

  it("the retired shared-login secret never reappears in the production template", () => {
    expect(template.has("SHARED_LOGIN_PASSWORD_HASH_B64")).toBe(false);
  });

  it("the required production core is present in the template", () => {
    const REQUIRED = [
      "DATABASE_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB",
      "SESSION_SECRET", "PUBLIC_BASE_URL", "STORAGE_ROOT", "MEDIA_URL_SECRET",
      "OPENROUTER_API_KEY", "OPENROUTER_MEDIA_TIMEOUT_MS",
      "TAVILY_API_KEY", "APIFY_API_TOKEN", "ELEVENLABS_API_KEY",
      "N8N_WEBHOOK_SECRET", "INTELLIGENCE_WEBHOOK_SECRET",
      "ZERNIO_API_KEY", "ZERNIO_WEBHOOK_SECRET",
      "PLAUSIBLE_API_KEY", "PLAUSIBLE_SITE_ID", "PLAUSIBLE_HOST",
    ];
    const missing = REQUIRED.filter((v) => !template.has(v));
    expect(missing, `required production vars missing from the template:\n${missing.join("\n")}`).toEqual([]);
  });
});
