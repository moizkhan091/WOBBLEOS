import { eq, lt } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { graphCheckpoints } from "@/db/schema";
import {
  buildGraphCheckpointRow,
  isCheckpointReusable,
  type GraphCheckpointRow,
} from "@/lib/domain/graph-checkpoint";
import type { NodeCheckpointBinding } from "@/lib/agents/node-telemetry";

/**
 * Graph checkpoint service (IO). Durable per-node outputs so a multi-agent graph resumes after a
 * failure/restart/retry instead of re-running (re-charging) completed nodes. Store is injectable so
 * the resume logic is fully testable without a DB.
 */

export interface SaveCheckpointInput {
  nodeSlug: string;
  nodeIndex: number;
  status?: "completed" | "failed";
  outputText: string;
  output?: Record<string, unknown> | null;
  modelRunIds?: string[];
  error?: string | null;
}

export interface GraphCheckpointStore {
  listCheckpoints(graphRunId: string): Promise<GraphCheckpointRow[]>;
  /** Upsert on (graph_run_id, node_slug) so duplicate workers / retries can't create duplicate rows. */
  upsertCheckpoint(row: GraphCheckpointRow): Promise<void>;
  deleteCheckpoints(graphRunId: string): Promise<number>;
  deleteExpiredCheckpoints(before: Date): Promise<number>;
}

/**
 * Everything the shared node runner needs to resume a graph: the reusable cached outputs (by node
 * slug) and a SAFE save fn (never throws — a checkpoint write must not fail the graph it observes).
 */
export interface CheckpointContext {
  graphRunId: string;
  graph: string;
  schemaVersion: number;
  cached: Map<string, GraphCheckpointRow>;
  save: (input: SaveCheckpointInput, opts?: { now?: Date }) => Promise<void>;
}

export interface CheckpointDeps {
  store?: GraphCheckpointStore;
  now?: Date;
}

/**
 * Load the reusable checkpoints for a run and return a context the node runner can use. Only outputs
 * that COMPLETED under the CURRENT schema version are offered for reuse; anything else is re-run.
 */
export async function loadCheckpointContext(
  input: { graph: string; graphRunId: string; schemaVersion: number },
  deps: CheckpointDeps = {},
): Promise<CheckpointContext> {
  const store = deps.store ?? defaultCheckpointStore();
  let rows: GraphCheckpointRow[] = [];
  try {
    rows = await store.listCheckpoints(input.graphRunId);
  } catch (error) {
    // A read failure must never break the graph — just run everything fresh.
    console.error("checkpoint load failed; running graph without resume:", error instanceof Error ? error.message : error);
  }
  const cached = new Map<string, GraphCheckpointRow>();
  for (const row of rows) {
    if (isCheckpointReusable(row, input.schemaVersion)) cached.set(row.nodeSlug, row);
  }
  return {
    graphRunId: input.graphRunId,
    graph: input.graph,
    schemaVersion: input.schemaVersion,
    cached,
    save: async (save, opts) => {
      try {
        const row = buildGraphCheckpointRow(
          {
            graphRunId: input.graphRunId,
            graph: input.graph,
            nodeSlug: save.nodeSlug,
            nodeIndex: save.nodeIndex,
            schemaVersion: input.schemaVersion,
            status: save.status ?? "completed",
            outputText: save.outputText,
            output: save.output ?? null,
            modelRunIds: save.modelRunIds ?? [],
            error: save.error ?? null,
          },
          { now: opts?.now ?? deps.now },
        );
        await store.upsertCheckpoint(row);
      } catch (error) {
        // Best-effort: a failed checkpoint write only costs a re-run on resume, never correctness.
        console.error("checkpoint save failed (node will re-run on resume):", error instanceof Error ? error.message : error);
      }
    },
  };
}

/**
 * Build the per-node checkpoint binding the shared node runner consumes: the reusable cached output
 * for this node (if any) and a save fn. `nodeKey` is the node's stable identity WITHIN the graph and
 * MUST be unique per node — never the agent slug, since two nodes can share a slug (content graph's
 * draft + revise are both the copywriter). Returns undefined when checkpointing is off (no context).
 */
export function bindNodeCheckpoint(ctx: CheckpointContext | undefined, nodeKey: string, nodeIndex: number): NodeCheckpointBinding | undefined {
  if (!ctx) return undefined;
  const hit = ctx.cached.get(nodeKey);
  return {
    cachedText: hit?.outputText,
    cachedModelRunIds: hit?.modelRunIds,
    save: (input) => ctx.save({ nodeSlug: nodeKey, nodeIndex, ...input }),
  };
}

/** Clear a run's checkpoints — called on successful completion or cancellation (no longer needed). */
export async function clearGraphCheckpoints(graphRunId: string, deps: CheckpointDeps = {}): Promise<void> {
  const store = deps.store ?? defaultCheckpointStore();
  try {
    await store.deleteCheckpoints(graphRunId);
  } catch (error) {
    console.error("checkpoint clear failed (retention purge will reap it):", error instanceof Error ? error.message : error);
  }
}

/** Retention sweep: drop checkpoints for abandoned runs older than the cutoff. Returns rows removed. */
export async function purgeExpiredGraphCheckpoints(before: Date, deps: CheckpointDeps = {}): Promise<number> {
  const store = deps.store ?? defaultCheckpointStore();
  return store.deleteExpiredCheckpoints(before);
}

export const GRAPH_CHECKPOINT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// ---------------------------------------------------------------- default store (DB)

export function defaultCheckpointStore(db: Db = getDb()): GraphCheckpointStore {
  return {
    async listCheckpoints(graphRunId) {
      const rows = await db.select().from(graphCheckpoints).where(eq(graphCheckpoints.graphRunId, graphRunId));
      return rows as GraphCheckpointRow[];
    },
    async upsertCheckpoint(row) {
      await db
        .insert(graphCheckpoints)
        .values(row)
        .onConflictDoUpdate({
          target: [graphCheckpoints.graphRunId, graphCheckpoints.nodeSlug],
          set: {
            nodeIndex: row.nodeIndex,
            status: row.status,
            schemaVersion: row.schemaVersion,
            outputText: row.outputText,
            output: row.output,
            modelRunIds: row.modelRunIds,
            error: row.error,
            updatedAt: row.updatedAt,
          },
        });
    },
    async deleteCheckpoints(graphRunId) {
      const deleted = await db.delete(graphCheckpoints).where(eq(graphCheckpoints.graphRunId, graphRunId)).returning({ id: graphCheckpoints.id });
      return deleted.length;
    },
    async deleteExpiredCheckpoints(before) {
      const deleted = await db.delete(graphCheckpoints).where(lt(graphCheckpoints.createdAt, before)).returning({ id: graphCheckpoints.id });
      return deleted.length;
    },
  };
}
