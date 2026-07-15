/**
 * Build identity + service version parity (WOB-UAT-026).
 *
 * The hazard this exists to stop, observed live during the local UAT campaign: a targeted rebuild
 * (`docker compose up -d --build app`) replaced ONLY the app while `worker` and `worker-video` kept
 * running the previous image — against a schema the migrator had already advanced. The failure was
 * silent and actively misleading: a seed executed by the stale worker "succeeded" and simply did not
 * write a column it had never heard of.
 *
 * Every service image (runner, worker, migrator) is stamped at build time with ONE shared
 * `WOBBLE_BUILD_ID` (the git SHA). Each worker reports its build id on every heartbeat; the app knows
 * its own. `/api/health/version` compares them and names the exact stale service, and readiness treats
 * a mismatch as a critical failure so an orchestrator will not route traffic to a split-brain stack.
 *
 * This module is pure + injectable so the mismatch logic is unit-tested without Docker.
 */

/** Stamped into every image at build time (Dockerfile ARG → ENV). "unknown" outside a built image. */
export const UNKNOWN_BUILD_ID = "unknown";

export function getBuildId(env: Record<string, string | undefined> = process.env): string {
  const raw = env.WOBBLE_BUILD_ID?.trim();
  return raw && raw.length > 0 ? raw : UNKNOWN_BUILD_ID;
}

/** A short, log-friendly form. Never used for comparison — parity always compares the full id. */
export function shortBuildId(buildId: string): string {
  return buildId === UNKNOWN_BUILD_ID ? buildId : buildId.slice(0, 12);
}

export interface ServiceVersion {
  /** Service name as an operator would name it to Docker: app | worker | worker-video | migrate. */
  service: string;
  buildId: string;
  /** False when the service's report is too old to trust (a stale heartbeat proves nothing about now). */
  fresh: boolean;
}

export interface VersionParityResult {
  ok: boolean;
  expectedBuildId: string;
  /** Services whose build id differs from the app's — the exact things to rebuild. */
  stale: { service: string; buildId: string }[];
  /** Services that could not be checked (no fresh heartbeat). Not proof of a mismatch, but not proof of parity either. */
  unknown: string[];
  reason: string | null;
}

/**
 * Compare every reporting service against the app's build id.
 *
 * The app is the reference because it is the surface a founder is looking at. Deliberate choices:
 *  - a service with a STALE heartbeat is `unknown`, never silently "fine" — we cannot see its version,
 *    so we must not claim parity;
 *  - `unknown` build ids (an unstamped image) are treated as a MISMATCH rather than a pass, because
 *    "I don't know what I'm running" is exactly the condition that caused this defect;
 *  - parity is only `ok` when at least one worker actually reported. An empty fleet is not parity.
 */
export function computeVersionParity(appBuildId: string, services: ServiceVersion[]): VersionParityResult {
  const stale: { service: string; buildId: string }[] = [];
  const unknown: string[] = [];

  for (const s of services) {
    if (!s.fresh) {
      unknown.push(s.service);
      continue;
    }
    if (s.buildId !== appBuildId) stale.push({ service: s.service, buildId: s.buildId });
  }

  if (appBuildId === UNKNOWN_BUILD_ID) {
    return {
      ok: false,
      expectedBuildId: appBuildId,
      stale,
      unknown,
      reason: "the app image carries no WOBBLE_BUILD_ID — build identity is unknown, so version parity cannot be proven",
    };
  }

  if (stale.length > 0) {
    const detail = stale.map((s) => `${s.service} is running ${shortBuildId(s.buildId)}`).join("; ");
    return {
      ok: false,
      expectedBuildId: appBuildId,
      stale,
      unknown,
      reason: `version mismatch — app is running ${shortBuildId(appBuildId)} but ${detail}. Rebuild ALL services: docker compose up -d --build`,
    };
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      expectedBuildId: appBuildId,
      stale,
      unknown,
      reason: `cannot verify version parity — no fresh report from: ${unknown.join(", ")}`,
    };
  }

  if (services.length === 0) {
    return {
      ok: false,
      expectedBuildId: appBuildId,
      stale,
      unknown,
      reason: "no worker reported a build id — an empty fleet is not proof of version parity",
    };
  }

  return { ok: true, expectedBuildId: appBuildId, stale, unknown, reason: null };
}
