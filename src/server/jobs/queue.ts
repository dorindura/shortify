// src/server/jobs/queue.ts
import type { Job as AppJob } from "@lib/jobsStore";
import { Queue } from "bullmq";
import IORedis from "ioredis";

// One Redis connection for the Queue
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const jobsQueue = new Queue("jobs", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueJob(job: AppJob) {
  console.log("[enqueueJob] Enqueue:", job.id);

  // enqueue *only* the jobId (small payload, stable, idempotent)
  await jobsQueue.add(
    "process",
    { jobId: job.id },
    { jobId: job.id }, // dedupe: same job won't be enqueued twice
  );

  return job.id;
}
