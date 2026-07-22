import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { listProviderConnections } from "@/lib/providers";
import { modelRoleMapSchema } from "@/lib/domain/providers";

/** Settings overview — the OS's operational config, read-only + honest about what's connected. */

export interface IntegrationStatus { key: string; label: string; configured: boolean; envVar: string }

export interface SettingsOverview {
  modelRoles: Array<{ role: string; provider: string; model: string }>;
  providers: Array<{ slug: string; label: string; enabled: boolean; permissionMode: string; healthStatus: string; allowedModules: string[] }>;
  integrations: IntegrationStatus[];
}

// The external keys the OS looks for. `configured` reflects the live environment (never leaks values).
const INTEGRATIONS: Array<{ key: string; label: string; envVar: string; aliasEnvVars?: string[] }> = [
  { key: "openrouter", label: "OpenRouter (LLM brain)", envVar: "OPENROUTER_API_KEY" },
  // APIFY_API_KEY is the legacy alias — a deploy still using it must not read as "not configured".
  { key: "apify", label: "Apify (web/social scraper)", envVar: "APIFY_API_TOKEN", aliasEnvVars: ["APIFY_API_KEY"] },
  { key: "zernio", label: "Zernio (social publishing)", envVar: "ZERNIO_API_KEY" },
  { key: "search", label: "Search API", envVar: "SEARCH_API_KEY" },
  { key: "fal", label: "fal.ai (video/media gen)", envVar: "FAL_API_KEY" },
  { key: "n8n", label: "n8n (automation webhooks)", envVar: "N8N_WEBHOOK_SECRET" },
  { key: "public_base_url", label: "Public base URL (webhooks)", envVar: "PUBLIC_BASE_URL" },
  { key: "database", label: "Database", envVar: "DATABASE_URL" },
];

export async function getSettingsOverview(deps: { db?: Db; env?: Record<string, string | undefined> } = {}): Promise<SettingsOverview> {
  const db = deps.db ?? getDb();
  const env = deps.env ?? process.env;

  const roleRows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "model_roles")).limit(1);
  const roleMap = modelRoleMapSchema.parse(roleRows[0]?.value ?? {});
  const modelRoles = Object.entries(roleMap).map(([role, cfg]) => ({ role, provider: cfg.provider, model: cfg.model }));

  const providers = (await listProviderConnections()).map((p) => ({ slug: p.slug, label: p.label, enabled: p.enabled, permissionMode: p.permissionMode, healthStatus: p.healthStatus, allowedModules: p.allowedModules }));

  const integrations: IntegrationStatus[] = INTEGRATIONS.map((i) => ({
    key: i.key, label: i.label, envVar: i.envVar,
    configured: [i.envVar, ...(i.aliasEnvVars ?? [])].some((v) => Boolean((env[v] ?? "").trim())),
  }));

  return { modelRoles, providers, integrations };
}
