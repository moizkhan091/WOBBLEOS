import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ServiceBinding } from "@/lib/domain/department";
import { hasHandler } from "@/lib/workers/registry";
import { falConfigured } from "@/lib/domain/media";
import { zernioConfigured } from "@/lib/library/zernio";

/**
 * Resolve what a `service_department`'s backing services are ACTUALLY doing (WOB-UAT-025).
 *
 * A service department's capability is real code — a dedicated worker, a durable job type, a
 * deterministic route, a provider adapter — rather than a roster of LLM agents. Its health must
 * therefore be derived from whether that code is alive, NOT from `department_members`, which it
 * legitimately has none of. Free Audit, Media Production and Publishing all work today and all rendered
 * "draft · team 0/0", identical to two departments that genuinely do not exist.
 *
 * Every state returned here must be something we OBSERVED. `unknown` is a real answer and is never
 * downgraded to "fine" — a worker whose heartbeat we cannot read has told us nothing about itself.
 * That is the same rule the version-parity gate applies to a stale heartbeat, for the same reason: the
 * silent-stale-worker defect (WOB-UAT-026) is exactly what happens when absence is read as health.
 */

export type ServiceBindingState = "alive" | "missing" | "blocked" | "unknown";

export interface ResolvedServiceBinding {
  kind: string;
  ref: string;
  required: boolean;
  state: ServiceBindingState;
  detail?: string;
}

export interface ServiceBindingDeps {
  storageRoot?: string;
  now?: () => Date;
  /** Max age of a worker heartbeat before it proves nothing. Matches the readiness/parity window. */
  heartbeatMaxAgeMs?: number;
  readHeartbeat?: (fileName: string) => Promise<{ at?: string } | null>;
  /** Injectable for tests; defaults to the real job registry. */
  jobTypeKnown?: (type: string) => boolean;
  /** Injectable for tests; defaults to the real env-backed adapter checks. */
  adapterConfigured?: (ref: string) => boolean | null;
}

/**
 * Worker name → its heartbeat file. These are the SAME files `getServiceVersions`/`getReadiness` read,
 * deliberately: a department must not disagree with the readiness probe about whether a worker is up.
 */
const WORKER_HEARTBEAT_FILES: Record<string, string> = {
  worker: "worker-heartbeat.json",
  "worker-video": "video-worker-heartbeat.json",
};

/**
 * Adapter ref → is it configured? `null` means "we do not know this adapter", which is a
 * misconfiguration in the seed rather than a runtime state, and surfaces as `unknown`.
 */
function defaultAdapterConfigured(ref: string): boolean | null {
  if (ref === "fal") return falConfigured();
  if (ref === "zernio") return zernioConfigured();
  return null;
}

async function defaultReadHeartbeat(storageRoot: string, fileName: string): Promise<{ at?: string } | null> {
  try {
    return JSON.parse(await readFile(path.join(storageRoot, "temp", fileName), "utf8")) as { at?: string };
  } catch {
    return null;
  }
}

export async function resolveServiceBindings(bindings: ServiceBinding[], deps: ServiceBindingDeps = {}): Promise<ResolvedServiceBinding[]> {
  const storageRoot = deps.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const maxAgeMs = deps.heartbeatMaxAgeMs ?? 150_000;
  const readHeartbeat = deps.readHeartbeat ?? ((f: string) => defaultReadHeartbeat(storageRoot, f));
  const jobTypeKnown = deps.jobTypeKnown ?? ((t: string) => hasHandler(t));
  const adapterConfigured = deps.adapterConfigured ?? defaultAdapterConfigured;

  return Promise.all(
    bindings.map(async (b): Promise<ResolvedServiceBinding> => {
      const base = { kind: b.kind, ref: b.ref, required: b.required };
      switch (b.kind) {
        case "worker": {
          const file = WORKER_HEARTBEAT_FILES[b.ref];
          // An unmapped worker name is a SEED bug, not a dead worker. Say so rather than reporting it
          // down — "I don't know how to check this" and "this is broken" are different statements.
          if (!file) return { ...base, state: "unknown", detail: `no heartbeat file mapped for worker '${b.ref}'` };
          const beat = await readHeartbeat(file);
          if (!beat) return { ...base, state: "missing", detail: "no heartbeat file — worker has never reported or storage is unreadable" };
          const at = typeof beat.at === "string" ? Date.parse(beat.at) : NaN;
          if (!Number.isFinite(at)) return { ...base, state: "unknown", detail: "heartbeat has no readable timestamp" };
          const ageMs = nowMs - at;
          if (ageMs > maxAgeMs) return { ...base, state: "missing", detail: `heartbeat is ${Math.round(ageMs / 1000)}s old (> ${Math.round(maxAgeMs / 1000)}s) — worker is not running` };
          return { ...base, state: "alive", detail: `heartbeat ${Math.round(ageMs / 1000)}s ago` };
        }
        case "job_type":
          return jobTypeKnown(b.ref)
            ? { ...base, state: "alive", detail: "handler registered" }
            : { ...base, state: "missing", detail: `no handler registered for job type '${b.ref}' — work of this type can never be executed` };
        case "adapter": {
          const configured = adapterConfigured(b.ref);
          if (configured === null) return { ...base, state: "unknown", detail: `unrecognised adapter '${b.ref}'` };
          return configured
            ? { ...base, state: "alive", detail: "credentials configured" }
            : { ...base, state: "blocked", detail: "credentials not configured" };
        }
        case "route":
          // A route is part of THIS build: if this code is executing, the handler is deployed. That is a
          // true inference but a weak one — it cannot detect a route that 500s. It is honest about what
          // it proves, and it is why a synchronous, in-request capability (Free Audit) is `healthy` when
          // the app is up: it has no background dependency that could be separately dead.
          return { ...base, state: "alive", detail: "served by this app build" };
        default:
          return { ...base, state: "unknown", detail: `unhandled binding kind '${b.kind}'` };
      }
    }),
  );
}
