// src/server/jobs/queue.ts
import type { Job } from "@lib/jobsStore";
import { updateJobStatus } from "@lib/jobsStore";
import { processJob } from "@server/jobs/worker";

/**
 * In the future this will add the job to a real queue (BullMQ, etc.).
 * For now it immediately starts processing the job.
 */
export async function enqueueJob(job: Job) {
    console.log("[enqueueJob] Job enqueued:", job.id);
    // Mark as pending for now
    updateJobStatus(job.id, "pending");

    // Immediately process in background (no real queue yet)
    processJob(job.id).catch((err) => {
        console.error("[enqueueJob] Error processing job:", err);
    });
}
