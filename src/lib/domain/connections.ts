import { z } from "zod";
import { newId } from "@/lib/ids";

export const CONNECTION_HEALTH_STATUSES = [
  "unknown",
  "healthy",
  "degraded",
  "disabled",
  "missing_credential",
  "error",
] as const;
export type ConnectionHealthStatus = (typeof CONNECTION_HEALTH_STATUSES)[number];

export const CONNECTION_PERMISSION_MODES = ["read_only", "write_only", "read_write", "webhook_only"] as const;
export type ConnectionPermissionMode = (typeof CONNECTION_PERMISSION_MODES)[number];

/**
 * Server-authoritative map of KNOWN provider slug → the exact env var that holds its credential
 * (WOB-AUD-010). A caller cannot register/patch a known provider to read an UNRELATED env var (e.g.
 * point slug `openrouter` at `SESSION_SECRET`), which would otherwise leak that secret to the provider's
 * health probe. For known slugs the credential env name is forced to this value regardless of the caller
 * input. Slugs with an outbound health probe MUST be pinned here.
 */
export const PROVIDER_CREDENTIAL_ENV: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  tavily: "TAVILY_API_KEY",
  search_api: "SEARCH_API_KEY",
  apify: "APIFY_API_TOKEN",
  fal: "FAL_KEY",
  zernio: "ZERNIO_API_KEY",
  n8n: "N8N_WEBHOOK_SECRET",
  embedding: "EMBEDDING_API_KEY",
};

/** The pinned credential env var for a known provider slug, or null if the slug is not a known provider. */
export function credentialEnvForSlug(slug: string): string | null {
  return PROVIDER_CREDENTIAL_ENV[slug] ?? null;
}

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "slug must be lowercase letters, numbers, dashes or underscores");

const moduleSchema = z.string().trim().min(1).max(120);

export const registerConnectionSchema = z.object({
  slug: slugSchema,
  label: z.string().trim().min(1).max(160),
  providerType: z.string().trim().min(1).max(80),
  credentialKeyName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z0-9_]+$/, "credential key name must reference an env var, not a secret value"),
  enabled: z.boolean().default(false),
  allowedModules: z.array(moduleSchema).default([]),
  permissionMode: z.enum(CONNECTION_PERMISSION_MODES).default("read_write"),
  costCategory: z.string().trim().min(1).max(80),
  healthStatus: z.enum(CONNECTION_HEALTH_STATUSES).default("unknown"),
  referenceDocPath: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RegisterConnectionInput = z.input<typeof registerConnectionSchema>;

export const updateConnectionSchema = registerConnectionSchema
  .omit({ slug: true })
  .partial()
  .extend({
    allowedModules: z.array(moduleSchema).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
export type UpdateConnectionInput = z.input<typeof updateConnectionSchema>;

export const connectionGuardSchema = z.object({
  slug: slugSchema,
  module: moduleSchema,
  action: z.string().trim().min(1).max(120).optional(),
});
export type ConnectionGuardInput = z.infer<typeof connectionGuardSchema>;

export interface ConnectionRow {
  id: string;
  slug: string;
  label: string;
  providerType: string;
  credentialKeyName: string;
  enabled: boolean;
  allowedModules: string[];
  permissionMode: string;
  costCategory: string;
  healthStatus: string;
  referenceDocPath: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectionView {
  id: string;
  slug: string;
  label: string;
  providerType: string;
  credentialKeyName: string;
  credentialConfigured: boolean;
  enabled: boolean;
  allowedModules: string[];
  permissionMode: string;
  costCategory: string;
  healthStatus: string;
  referenceDocPath: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ConnectionGuardCode =
  | "allowed"
  | "connection_not_found"
  | "connection_disabled"
  | "module_not_allowed"
  | "missing_credential";

export interface ConnectionGuardDecision {
  allowed: boolean;
  code: ConnectionGuardCode;
  reason: string;
  slug: string;
  module: string;
  action: string | null;
}

export function buildConnectionRow(
  input: RegisterConnectionInput,
  opts: { id?: string; now?: Date } = {},
): ConnectionRow {
  const parsed = registerConnectionSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("conn"),
    slug: parsed.slug,
    label: parsed.label,
    providerType: parsed.providerType,
    credentialKeyName: parsed.credentialKeyName,
    enabled: parsed.enabled,
    allowedModules: parsed.allowedModules,
    permissionMode: parsed.permissionMode,
    costCategory: parsed.costCategory,
    healthStatus: parsed.healthStatus,
    referenceDocPath: parsed.referenceDocPath ?? null,
    metadata: parsed.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeConnection(
  row: ConnectionRow,
  opts: { credentialConfigured: boolean },
): ConnectionView {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    providerType: row.providerType,
    credentialKeyName: row.credentialKeyName,
    credentialConfigured: opts.credentialConfigured,
    enabled: row.enabled,
    allowedModules: [...row.allowedModules],
    permissionMode: row.permissionMode,
    costCategory: row.costCategory,
    healthStatus: row.healthStatus,
    referenceDocPath: row.referenceDocPath,
    metadata: { ...row.metadata },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function evaluateConnectionGuard(input: {
  connection: ConnectionRow | null;
  slug?: string;
  module: string;
  action?: string;
  credentialConfigured: boolean;
}): ConnectionGuardDecision {
  const slug = input.connection?.slug ?? input.slug ?? "unknown";
  const action = input.action ?? null;

  if (!input.connection) {
    return {
      allowed: false,
      code: "connection_not_found",
      reason: `connection '${slug}' is not configured`,
      slug,
      module: input.module,
      action,
    };
  }

  if (!input.connection.enabled) {
    return {
      allowed: false,
      code: "connection_disabled",
      reason: `connection '${slug}' is disabled`,
      slug,
      module: input.module,
      action,
    };
  }

  if (input.connection.allowedModules.length > 0 && !input.connection.allowedModules.includes(input.module)) {
    return {
      allowed: false,
      code: "module_not_allowed",
      reason: `connection '${slug}' is not allowed for module '${input.module}'`,
      slug,
      module: input.module,
      action,
    };
  }

  if (!input.credentialConfigured) {
    return {
      allowed: false,
      code: "missing_credential",
      reason: `credential '${input.connection.credentialKeyName}' is not configured`,
      slug,
      module: input.module,
      action,
    };
  }

  return {
    allowed: true,
    code: "allowed",
    reason: `connection '${slug}' is allowed for module '${input.module}'`,
    slug,
    module: input.module,
    action,
  };
}

function normalizeRequirementList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return [];
}

export function extractJobConnectionSlugs(payload: Record<string, unknown>): string[] {
  const set = new Set<string>();
  for (const key of ["requiredConnectionSlug", "requiredConnectionSlugs", "requiredConnections"]) {
    for (const slug of normalizeRequirementList(payload[key])) set.add(slug);
  }
  return [...set];
}
