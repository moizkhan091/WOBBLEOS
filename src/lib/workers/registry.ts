import type { JobHandler, JobHandlerRegistry } from "@/lib/jobs";
import type { JobRow } from "@/lib/domain/jobs";
import { runContentGenerateJobHandler } from "@/lib/content-worker";
import { runContentGraphJobHandler } from "@/lib/content-graph";
import { runKnowledgeCompileJobHandler } from "@/lib/knowledge";
import { runLibraryImportJobHandler, runPublishingDispatchJobHandler } from "@/lib/library";

/**
 * Chunk 07: Worker handler registry.
 *
 * Maps a job `type` to the function that runs it. Handlers are data, not
 * hardcoded into the queue — new job types are added here (or by future
 * chunks: content, research, media, etc.). The general worker starts with a
 * couple of safe built-ins so the runtime can be exercised end to end.
 */

const noop: JobHandler = async () => ({});

const echo: JobHandler = async (job: JobRow) => ({ echoed: job.payload });

export const generalRegistry: JobHandlerRegistry = {
  noop,
  "test.echo": echo,
  "content.generate": runContentGenerateJobHandler,
  "content.graph": runContentGraphJobHandler,
  "knowledge.compile": runKnowledgeCompileJobHandler,
  "publishing.dispatch": runPublishingDispatchJobHandler,
  "library.import": runLibraryImportJobHandler,
};

export function getHandler(type: string, registry: JobHandlerRegistry = generalRegistry): JobHandler | undefined {
  return registry[type];
}

export function hasHandler(type: string, registry: JobHandlerRegistry = generalRegistry): boolean {
  return Boolean(registry[type]);
}

export function knownJobTypes(registry: JobHandlerRegistry = generalRegistry): string[] {
  return Object.keys(registry);
}
