import { z } from "zod";

export const modelRoleConfigSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

export type ModelRoleConfig = z.infer<typeof modelRoleConfigSchema>;

export const modelRoleMapSchema = z.record(z.string().trim().min(1), modelRoleConfigSchema);
export type ModelRoleMap = z.infer<typeof modelRoleMapSchema>;

export interface ProviderConnectionConfig {
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
}

export interface NormalizedProviderError {
  provider: string;
  operation: string;
  message: string;
  statusCode: number | null;
  retryable: boolean;
  code: string | null;
}

export function resolveModelRole(role: string, roleMap: ModelRoleMap): ModelRoleConfig {
  const parsed = modelRoleMapSchema.parse(roleMap);
  // Fall back to a "default" role when one is configured, so a new agent whose specific role
  // hasn't been mapped yet uses the house model instead of crashing its run. With no default
  // configured, an unmapped role still fails loudly (surfaces a genuine misconfiguration).
  const config = parsed[role] ?? parsed.default;
  if (!config) {
    throw new Error(`model role '${role}' is not configured (and no 'default' role is set)`);
  }
  return config;
}

export function assertProviderAllowedForModule(connection: ProviderConnectionConfig, module: string): void {
  if (!connection.enabled) {
    throw new Error(`provider '${connection.slug}' is disabled`);
  }
  if (connection.allowedModules.length > 0 && !connection.allowedModules.includes(module)) {
    throw new Error(`provider '${connection.slug}' is not allowed for module '${module}'`);
  }
}

function statusFrom(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const maybe = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const value = maybe.status ?? maybe.statusCode ?? maybe.response?.status;
  return typeof value === "number" ? value : null;
}

function codeFrom(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const maybe = error as { code?: unknown };
  return typeof maybe.code === "string" ? maybe.code : null;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/OPENROUTER_API_KEY=[^\s]+/g, "OPENROUTER_API_KEY=[redacted]");
}

export function normalizeProviderError(input: {
  provider: string;
  operation: string;
  error: unknown;
}): NormalizedProviderError {
  const statusCode = statusFrom(input.error);
  const code = codeFrom(input.error);
  const retryable = statusCode === 429 || statusCode === 408 || (statusCode !== null && statusCode >= 500);

  return {
    provider: input.provider,
    operation: input.operation,
    message: sanitizeProviderMessage(messageFrom(input.error)),
    statusCode,
    retryable,
    code,
  };
}
