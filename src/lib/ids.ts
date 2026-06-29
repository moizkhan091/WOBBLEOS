import { randomUUID } from "node:crypto";

/**
 * Generate a stable, prefixed identifier (e.g. "audit_<uuid>").
 * Matches the seed convention of human-readable prefixes on text primary keys.
 */
export function newId(prefix: string): string {
  if (!prefix) {
    throw new Error("newId requires a non-empty prefix");
  }
  return `${prefix}_${randomUUID()}`;
}
