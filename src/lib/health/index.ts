import { sql } from "drizzle-orm";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { getDb, type Db } from "@/db";
import { computeVersionParity, getBuildId, shortBuildId, UNKNOWN_BUILD_ID, type VersionParityResult } from "@/lib/build/version";

/**
 * Liveness + readiness health for the isolated deploy. Readiness = the DB is reachable (a real `select 1`), so a
 * load balancer / docker healthcheck / the founder can tell "the app is up AND can serve" vs "up but degraded".
 * No auth (a health probe must be reachable by the orchestrator); it exposes NO business data — only up/down + a count.
 */
export interface HealthStatus {
  ok: boolean;
  status: "healthy" | "degraded";
  db: "up" | "down";
  dbLatencyMs: number | null;
  checkedAt: string;
}

export interface HealthDeps {
  pingDb?: () => Promise<void>;
  now?: () => Date;
}

export async function getHealthStatus(deps: HealthDeps = {}): Promise<HealthStatus> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  if (!deps.pingDb && !process.env.DATABASE_URL) {
    return { ok: false, status: "degraded", db: "down", dbLatencyMs: null, checkedAt };
  }
  const ping = deps.pingDb ?? (async () => { await (getDb() as Db).execute(sql`select 1`); });
  const start = now().getTime();
  try {
    await ping();
    return { ok: true, status: "healthy", db: "up", dbLatencyMs: Math.max(0, now().getTime() - start), checkedAt };
  } catch {
    return { ok: false, status: "degraded", db: "down", dbLatencyMs: null, checkedAt };
  }
}

/**
 * Aggregate READINESS (WOB-AUD-013) — distinct from the shallow liveness above. Readiness reflects the
 * whole operating system: DB reachable + storage writable + the general worker/scheduler and the
 * dedicated media worker heartbeating freshly. This is what an
 * orchestrator / deploy gate should poll, so "web is up" can never be mistaken for "the OS is working".
 */
/** A worker's on-disk heartbeat. `buildId` is what makes version parity checkable (WOB-UAT-026). */
export interface HeartbeatBeat {
  state?: string;
  at?: string;
  buildId?: string;
  workerId?: string;
}

export interface ReadinessCheck {
  name: string;
  critical: boolean;
  ok: boolean;
  detail?: string;
}
export interface ReadinessStatus {
  ok: boolean;
  status: "ready" | "not_ready";
  checks: ReadinessCheck[];
  checkedAt: string;
}

export interface ReadinessDeps {
  pingDb?: () => Promise<void>;
  now?: () => Date;
  storageRoot?: string;
  /** Heartbeat freshness threshold (ms). A worker writes every idle cycle (~1s); default 150s. */
  heartbeatMaxAgeMs?: number;
  /** Injectable heartbeat reader (tests). Returns the parsed heartbeat or null if missing/unreadable. */
  readHeartbeat?: (name: string) => Promise<HeartbeatBeat | null>;
  /** Injectable storage writability probe (tests). */
  probeStorage?: () => Promise<boolean>;
  /** Treat as production regardless of NODE_ENV (tests). Controls whether version parity is CRITICAL. */
  production?: boolean;
}

async function defaultReadHeartbeat(storageRoot: string, name: string): Promise<HeartbeatBeat | null> {
  try {
    const raw = await readFile(path.join(storageRoot, "temp", name), "utf8");
    return JSON.parse(raw) as HeartbeatBeat;
  } catch {
    return null;
  }
}

/** Is this beat recent enough that what it reports (state, buildId) is true of the worker RIGHT NOW? */
function isBeatFresh(beat: HeartbeatBeat | null, now: number, maxAgeMs: number): boolean {
  if (!beat || typeof beat.at !== "string") return false;
  const at = Date.parse(beat.at);
  return Number.isFinite(at) && now - at <= maxAgeMs;
}

function heartbeatCheck(name: string, critical: boolean, beat: HeartbeatBeat | null, now: number, maxAgeMs: number): ReadinessCheck {
  if (!beat || typeof beat.at !== "string") return { name, critical, ok: false, detail: "heartbeat missing" };
  const at = Date.parse(beat.at);
  if (!Number.isFinite(at)) return { name, critical, ok: false, detail: "heartbeat has no valid timestamp" };
  const ageMs = now - at;
  const state = String(beat.state ?? "");
  if (state.startsWith("error") || state === "stopped") return { name, critical, ok: false, detail: `unhealthy state '${state}'` };
  if (ageMs > maxAgeMs) return { name, critical, ok: false, detail: `stale (${Math.round(ageMs / 1000)}s old)` };
  return { name, critical, ok: true, detail: `fresh (${Math.round(ageMs / 1000)}s, '${state}')` };
}

export interface ServiceVersionsStatus {
  ok: boolean;
  buildId: string;
  services: { service: string; buildId: string; fresh: boolean }[];
  parity: VersionParityResult;
  checkedAt: string;
}

/**
 * Report the build id of every service and whether they agree (WOB-UAT-026).
 *
 * The app knows its own id from its image; each worker's rides on its heartbeat file. A worker whose
 * heartbeat is stale is reported `fresh: false` and treated as unverifiable rather than as agreeing —
 * we must never claim parity with a service we cannot currently see.
 */
export async function getServiceVersions(deps: ReadinessDeps = {}): Promise<ServiceVersionsStatus> {
  const nowFn = deps.now ?? (() => new Date());
  const nowMs = nowFn().getTime();
  const storageRoot = deps.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const maxAgeMs = deps.heartbeatMaxAgeMs ?? 150_000;
  const readHeartbeat = deps.readHeartbeat ?? ((name: string) => defaultReadHeartbeat(storageRoot, name));

  const appBuildId = getBuildId();
  const beats: [string, HeartbeatBeat | null][] = [
    ["worker", await readHeartbeat("worker-heartbeat.json")],
    ["worker-video", await readHeartbeat("video-worker-heartbeat.json")],
  ];
  const services = beats.map(([service, beat]) => ({
    service,
    buildId: String(beat?.buildId ?? UNKNOWN_BUILD_ID),
    fresh: isBeatFresh(beat, nowMs, maxAgeMs),
  }));

  const parity = computeVersionParity(appBuildId, services);
  return { ok: parity.ok, buildId: appBuildId, services: [{ service: "app", buildId: appBuildId, fresh: true }, ...services], parity, checkedAt: nowFn().toISOString() };
}

export async function getReadiness(deps: ReadinessDeps = {}): Promise<ReadinessStatus> {
  const nowFn = deps.now ?? (() => new Date());
  const checkedAt = nowFn().toISOString();
  const nowMs = nowFn().getTime();
  const storageRoot = deps.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const maxAgeMs = deps.heartbeatMaxAgeMs ?? 150_000;
  const readHeartbeat = deps.readHeartbeat ?? ((name: string) => defaultReadHeartbeat(storageRoot, name));

  const checks: ReadinessCheck[] = [];

  // DB (critical)
  const ping = deps.pingDb ?? (async () => { await (getDb() as Db).execute(sql`select 1`); });
  try {
    if (!deps.pingDb && !process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    await ping();
    checks.push({ name: "database", critical: true, ok: true });
  } catch (e) {
    checks.push({ name: "database", critical: true, ok: false, detail: e instanceof Error ? e.message : "down" });
  }

  // Storage writable (critical)
  const probeStorage = deps.probeStorage ?? (async () => {
    const temp = path.join(storageRoot, "temp");
    const probe = path.join(temp, "health-ready-probe.txt");
    await mkdir(temp, { recursive: true });
    await writeFile(probe, "ok", "utf8");
    const v = await readFile(probe, "utf8");
    await rm(probe, { force: true });
    return v === "ok";
  });
  try {
    checks.push({ name: "storage", critical: true, ok: await probeStorage(), detail: storageRoot });
  } catch (e) {
    checks.push({ name: "storage", critical: true, ok: false, detail: e instanceof Error ? e.message : "unwritable" });
  }

  // General worker + scheduler and dedicated media worker are both required production capabilities.
  const workerBeat = await readHeartbeat("worker-heartbeat.json");
  const videoBeat = await readHeartbeat("video-worker-heartbeat.json");
  checks.push(heartbeatCheck("worker", true, workerBeat, nowMs, maxAgeMs));
  checks.push(heartbeatCheck("video-worker", true, videoBeat, nowMs, maxAgeMs));

  /**
   * Version parity (WOB-UAT-026). A stack whose app and workers run different code is a split brain:
   * the app may render a schema the workers cannot write, and a job silently no-ops. This happened for
   * real during the UAT campaign via `docker compose up -d --build app`.
   *
   * CRITICAL in production only. Images are stamped at build time, so outside a built image (`npm run
   * dev`, unit tests) nothing is stamped and there is no version to disagree about — making it critical
   * there would fire permanently, and a check that always fires is a check everyone learns to ignore.
   * In production the protection is absolute: an unstamped or mismatched deployment fails readiness.
   */
  const isProduction = (deps.production ?? process.env.NODE_ENV === "production");
  const parity = computeVersionParity(getBuildId(), [
    { service: "worker", buildId: String(workerBeat?.buildId ?? UNKNOWN_BUILD_ID), fresh: isBeatFresh(workerBeat, nowMs, maxAgeMs) },
    { service: "worker-video", buildId: String(videoBeat?.buildId ?? UNKNOWN_BUILD_ID), fresh: isBeatFresh(videoBeat, nowMs, maxAgeMs) },
  ]);
  checks.push({
    name: "version-parity",
    critical: isProduction,
    ok: parity.ok,
    detail: parity.ok
      ? `all services on ${shortBuildId(parity.expectedBuildId)}`
      : isProduction
        ? (parity.reason ?? "version mismatch")
        : `${parity.reason ?? "version mismatch"} (not enforced outside production)`,
  });

  const ok = checks.filter((c) => c.critical).every((c) => c.ok);
  return { ok, status: ok ? "ready" : "not_ready", checks, checkedAt };
}
