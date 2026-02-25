// src/server/jobs/workerRunner.ts
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processJob } from "@/server/jobs/worker";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);

console.log("[workerRunner] starting, concurrency =", concurrency);

new Worker(
  "jobs",
  async (job) => {
    const { jobId } = job.data as { jobId: string };
    console.log("[worker] processing", jobId);
    await processJob(jobId);
    return { ok: true };
  },
  { connection, concurrency },
);
