import { describe, expect, it } from "vitest";
import { getHandler, hasHandler, knownJobTypes, generalRegistry } from "@/lib/workers/registry";
import { buildHeartbeatRow, isHeartbeatStale } from "@/lib/workers/heartbeat";
import { runWorker } from "@/lib/workers/runtime";
import type { ProcessResult } from "@/lib/jobs";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("worker registry", () => {
  it("resolves known job types and rejects unknown ones", () => {
    expect(getHandler("test.echo")).toBeTypeOf("function");
    expect(getHandler("noop")).toBeTypeOf("function");
    expect(getHandler("does.not.exist")).toBeUndefined();
    expect(hasHandler("test.echo")).toBe(true);
    expect(hasHandler("does.not.exist")).toBe(false);
  });

  it("lists the registered job types", () => {
    expect(knownJobTypes(generalRegistry)).toEqual(expect.arrayContaining(["noop", "test.echo"]));
  });
});

describe("heartbeat", () => {
  it("builds a deterministic per-worker row", () => {
    const row = buildHeartbeatRow({ workerName: "general", workerType: "general", status: "online", now });
    expect(row).toMatchObject({ id: "heartbeat_general", workerName: "general", status: "online", currentJobId: null, heartbeatAt: now });
  });

  it("flags stale heartbeats past the threshold", () => {
    expect(isHeartbeatStale(now, now, 30_000)).toBe(false);
    expect(isHeartbeatStale(new Date(now.getTime() - 60_000), now, 30_000)).toBe(true);
  });
});

describe("runWorker", () => {
  it("processes jobs until shouldStop, then writes a stopped heartbeat", async () => {
    // stop after 3 loop checks
    let checks = 0;
    const shouldStop = () => {
      checks += 1;
      return checks > 3;
    };

    // first poll has a job, the rest are empty
    let polls = 0;
    const process = async (): Promise<ProcessResult> => {
      polls += 1;
      return polls === 1 ? { processed: true, jobId: "job_1", outcome: "completed" } : { processed: false };
    };

    const beats: Array<{ status: string; jobId?: string }> = [];
    const heartbeat = async (status: string, jobId?: string) => {
      beats.push({ status, jobId });
    };

    const result = await runWorker({
      queue: "general",
      registry: {},
      shouldStop,
      process,
      heartbeat,
      sleep: async () => {},
      idleDelayMs: 0,
    });

    expect(result.processedCount).toBe(1);
    expect(beats[0]).toEqual({ status: "online", jobId: undefined }); // start
    expect(beats.some((b) => b.status === "online" && b.jobId === "job_1")).toBe(true); // after processing job
    expect(beats[beats.length - 1]).toEqual({ status: "stopped", jobId: undefined }); // final
  });
});
