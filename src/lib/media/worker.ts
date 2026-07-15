import { dispatchMediaJobs } from "@/lib/media";

export interface MediaWorkerCycleDeps {
  now?: Date;
  limit?: number;
  leaseOwner?: string;
  dispatch?: typeof dispatchMediaJobs;
}

/** One bounded media-worker cycle; injectable so tests never need a real provider. */
export async function runMediaWorkerCycle(deps: MediaWorkerCycleDeps = {}) {
  const dispatch = deps.dispatch ?? dispatchMediaJobs;
  return dispatch({
    now: deps.now ?? new Date(),
    limit: deps.limit ?? 10,
    leaseOwner: deps.leaseOwner,
  });
}
