import type { ProviderMessage } from "@/lib/providers";

/**
 * Shared telemetry wrapper for multi-agent graph nodes (content graph, paid-audit graph, and any
 * future graph). It records REAL agent telemetry — cost + latency on success, and a FAILED agent_run
 * (not a swallowed success) when a node errors or a required node returns unparseable output — then
 * rethrows so the graph still aborts. Before this, graph nodes only ever logged `succeeded`, so
 * failures were invisible and cost/latency were null.
 */

export interface GraphNodeRunResult {
  text: string;
  runId?: string;
  cost?: number;
}

/**
 * Per-node checkpoint binding. `cachedText` (when present) is a completed output for THIS node from a
 * prior run of the same graphRunId — reused instead of calling the model. `save` durably persists a
 * freshly-computed node output so a later failure can resume from here. Decoupled from the checkpoint
 * store so this module stays store-agnostic.
 */
export interface NodeCheckpointBinding {
  cachedText?: string;
  cachedModelRunIds?: string[];
  /** Persist this node's output. The node key + index are bound by the caller (bindNodeCheckpoint), so
   *  two nodes sharing an agent slug (e.g. draft + revise) never collide on the checkpoint key. */
  save?: (input: { outputText: string; output: Record<string, unknown> | null; modelRunIds: string[] }) => Promise<void>;
}

export interface GraphNodeSpec<T> {
  slug: string;
  role: string;
  module: string;
  messages: ProviderMessage[];
  linkedEntityId: string;
  parse: (text: string) => T | null;
  /** Required nodes throw (and record FAILED) on unparseable output; optional ones tolerate null. */
  required: boolean;
  parseErr: string;
  summarize: (parsed: T | null, run: GraphNodeRunResult) => {
    inputSummary?: string;
    outputSummary: string;
    sourceIdsUsed?: string[];
    memoryIdsUsed?: string[];
    qualityScore?: number;
  };
  /** Optional resume/persist binding — omit to disable checkpointing for this node. */
  checkpoint?: NodeCheckpointBinding;
}

type RunNodeFn = (input: { role: string; module: string; messages: ProviderMessage[]; linkedEntityId: string }) => Promise<GraphNodeRunResult>;
/** Must be a SAFE recorder that never throws — telemetry logging must not fail the job it observes. */
type RecordRunFn = (input: Record<string, unknown>) => Promise<void>;

export async function runGraphNode<T>(
  runNode: RunNodeFn,
  recordRun: RecordRunFn,
  spec: GraphNodeSpec<T>,
): Promise<{ parsed: T | null; run: GraphNodeRunResult }> {
  const startedAt = Date.now();
  const cp = spec.checkpoint;

  // RESUME: a completed output for this node exists from a prior run — reuse it, no model call, no
  // charge. Re-parse it against the current schema; if it no longer parses (corruption / drift the
  // version check didn't catch) fall through and re-run the node fresh.
  if (cp?.cachedText !== undefined) {
    const parsed = spec.parse(cp.cachedText);
    if (parsed || !spec.required) {
      const cachedRun: GraphNodeRunResult = { text: cp.cachedText, runId: cp.cachedModelRunIds?.[0], cost: 0 };
      const s = spec.summarize(parsed, cachedRun);
      await recordRun({
        agentSlug: spec.slug,
        status: "succeeded",
        inputSummary: s.inputSummary,
        outputSummary: `[resumed] ${s.outputSummary}`,
        modelRunIds: cp.cachedModelRunIds ?? [],
        sourceIdsUsed: s.sourceIdsUsed,
        memoryIdsUsed: s.memoryIdsUsed,
        costEstimate: 0,
        latencyMs: 0,
        qualityScore: s.qualityScore,
      });
      return { parsed, run: cachedRun };
    }
  }

  let run: GraphNodeRunResult | undefined;
  try {
    run = await runNode({ role: spec.role, module: spec.module, messages: spec.messages, linkedEntityId: spec.linkedEntityId });
    const parsed = spec.parse(run.text);
    if (!parsed && spec.required) throw new Error(spec.parseErr);
    const s = spec.summarize(parsed, run);
    await recordRun({
      agentSlug: spec.slug,
      status: "succeeded",
      inputSummary: s.inputSummary,
      outputSummary: s.outputSummary,
      modelRunIds: run.runId ? [run.runId] : [],
      sourceIdsUsed: s.sourceIdsUsed,
      memoryIdsUsed: s.memoryIdsUsed,
      costEstimate: run.cost,
      latencyMs: Date.now() - startedAt,
      qualityScore: s.qualityScore,
    });
    // CHECKPOINT: persist this completed output so a later node failure can resume from here.
    if (cp?.save) {
      await cp.save({
        outputText: run.text,
        output: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null,
        modelRunIds: run.runId ? [run.runId] : [],
      });
    }
    return { parsed, run };
  } catch (error) {
    await recordRun({
      agentSlug: spec.slug,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      modelRunIds: run?.runId ? [run.runId] : [],
      costEstimate: run?.cost,
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
