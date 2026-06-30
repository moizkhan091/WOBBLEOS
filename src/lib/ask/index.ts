import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { listMemoryRecords, retrieveMemoryContext } from "@/lib/memory";
import { listApprovedSourcesForJobs, listSourceChunks } from "@/lib/sources";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import { enqueueJob } from "@/lib/jobs";
import {
  buildAskAnswer,
  buildAskContext,
  classifyIntent,
  DEFAULT_CAPABILITIES,
  extractDoNotSay,
  type AskAnswer,
  type AskBrainRecord,
  type AskMemoryChunk,
  type AskSourceRef,
  type CapabilityRoute,
  type IntentType,
} from "@/lib/domain/ask";

/**
 * Chunk 11: Ask WOBBLE V1 - the OS command surface / router.
 *
 * Flow: classify intent -> if it's a question, answer from Brain + approved
 * evidence (cost-logged via runTextProvider, even when evidence is thin so the
 * model can explain the gap); if it's an action intent, route to the real
 * module/job when that module is "available", otherwise return a clean
 * "planned" route WITHOUT enqueuing a fake job. Retrieval / provider / enqueue
 * are injectable so the whole thing is testable without a DB or an LLM.
 */

export const askWobbleSchema = z.object({
  question: z.string().trim().min(1, "question is required"),
  founder: z.string().trim().min(1).optional(),
  memoryLimit: z.number().int().min(1).max(50).optional(),
  sourceLimit: z.number().int().min(1).max(50).optional(),
  sourceChunkLimit: z.number().int().min(1).max(10).optional(),
  maxTokens: z.number().int().min(100).max(1200).optional(),
});

export type AskWobbleInput = z.input<typeof askWobbleSchema>;

export type AskResult =
  | { type: "answer"; intent: IntentType; answer: AskAnswer }
  | {
      type: "route";
      intent: IntentType;
      module: string;
      status: "available" | "planned";
      message: string;
      jobId?: string;
    };

export interface AskWobbleDeps {
  classifyIntent?: (question: string) => IntentType;
  capabilities?: Record<IntentType, CapabilityRoute>;
  retrieveBrain?: () => Promise<AskBrainRecord[]>;
  retrieveMemory?: (question: string) => Promise<AskMemoryChunk[]>;
  retrieveSources?: () => Promise<AskSourceRef[]>;
  runProvider?: (input: { role: string; module: string; messages: ProviderMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
  enqueueJob?: (input: { queue: string; type: string; payload: Record<string, unknown>; linkedModule?: string }) => Promise<{ job: { id: string } }>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  doNotSay?: string;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export async function askWobble(input: AskWobbleInput, deps: AskWobbleDeps = {}): Promise<AskResult> {
  const parsed = askWobbleSchema.parse(input);
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const capabilities = deps.capabilities ?? DEFAULT_CAPABILITIES;
  const intent = (deps.classifyIntent ?? classifyIntent)(parsed.question);

  // ---- action intents -> router (delegate; never hardcode the module here) ----
  if (intent !== "question") {
    const route = capabilities[intent];

    if (route.status === "available" && route.jobType) {
      const enqueue = deps.enqueueJob ?? defaultEnqueue;
      const { job } = await enqueue({
        queue: route.queue ?? "general",
        type: route.jobType,
        payload: buildRoutePayload(intent, parsed.question, parsed.founder),
        linkedModule: route.module,
      });
      await recordAudit({
        eventType: "ask.routed",
        module: "ask_wobble",
        entityType: "job",
        entityId: job.id,
        actor: parsed.founder,
        metadata: { intent, module: route.module, jobType: route.jobType },
      });
      return { type: "route", intent, module: route.module, status: "available", message: `Routed to ${route.module}.`, jobId: job.id };
    }

    // Not built yet: recognise the route, do NOT fake completion or enqueue.
    await recordAudit({
      eventType: "ask.route_planned",
      module: "ask_wobble",
      entityType: "intent",
      actor: parsed.founder,
      metadata: { intent, module: route.module },
    });
    return {
      type: "route",
      intent,
      module: route.module,
      status: "planned",
      message: `Intent recognized: ${intent}. Route: ${route.module}. Status: planned/not available yet.`,
    };
  }

  // ---- question intent -> grounded answer path ----
  const retrieveBrain = deps.retrieveBrain ?? defaultRetrieveBrain;
  const retrieveMemory = deps.retrieveMemory ?? ((q: string) => defaultRetrieveMemory(q, parsed.memoryLimit));
  const retrieveSources = deps.retrieveSources ?? (() => defaultRetrieveSources(parsed.sourceLimit, parsed.sourceChunkLimit));
  const runProvider = deps.runProvider ?? defaultRunProvider;

  const [brain, memory, sources] = await Promise.all([retrieveBrain(), retrieveMemory(parsed.question), retrieveSources()]);
  const doNotSay = deps.doNotSay ?? extractDoNotSay(brain);
  const context = buildAskContext({ question: parsed.question, brain, memory, sources, doNotSay });

  // Always call the model (cost-logged). When evidence is thin the prompt makes
  // it explain the gap / ask a clarifying question instead of inventing.
  const { text, run } = await runProvider({
    role: "ask_wobble",
    module: "ask_wobble",
    messages: context.messages,
    maxTokens: parsed.maxTokens ?? 500,
  });
  const answer = buildAskAnswer(text, context, run.id);

  await recordAudit({
    eventType: "ask.answered",
    module: "ask_wobble",
    entityType: "model_run",
    entityId: run.id,
    modelRunId: run.id,
    actor: parsed.founder,
    metadata: {
      citations: answer.citations.length,
      confidence: answer.confidence,
      hasSufficientEvidence: answer.hasSufficientEvidence,
    },
  });

  return { type: "answer", intent, answer };
}

// ---- default wiring to the real Chunk 08/09/10 + queue modules ----

async function defaultRetrieveBrain(): Promise<AskBrainRecord[]> {
  const records = await listMemoryRecords({ memoryTier: "core", status: "active" });
  return records.map((r) => ({ slug: r.slug, title: r.title, area: r.area, content: r.content }));
}

async function defaultRetrieveMemory(question: string, limit?: number): Promise<AskMemoryChunk[]> {
  const chunks = await retrieveMemoryContext({ query: question, queryMode: "current", limit: limit ?? 8 });
  return chunks.map((c) => ({ id: c.id, content: c.content, trustLevel: c.trustLevel, tags: c.tags }));
}

async function defaultRetrieveSources(limit?: number, chunkLimit?: number): Promise<AskSourceRef[]> {
  const rows = await listApprovedSourcesForJobs({ limit: limit ?? 8 });
  const chunksBySource = await Promise.all(
    rows.map((source) => listSourceChunks(source.id, { limit: chunkLimit ?? 3 })),
  );

  return rows.map((s, index) => ({
    id: s.id,
    title: s.title,
    sourceType: s.sourceType,
    trustLevel: s.trustLevel,
    chunks: chunksBySource[index].map((chunk) => ({ id: chunk.id, content: chunk.content })),
  }));
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

async function defaultEnqueue(input: { queue: string; type: string; payload: Record<string, unknown>; linkedModule?: string }) {
  const result = await enqueueJob(input);
  return { job: { id: result.job.id } };
}

function buildRoutePayload(intent: IntentType, question: string, founder?: string): Record<string, unknown> {
  if (intent === "content_generation") {
    return {
      contentTrackId: "track_wobble_company",
      requestedBy: founder,
      objective: question,
    };
  }
  return { question, requestedBy: founder };
}
