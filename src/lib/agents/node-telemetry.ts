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
