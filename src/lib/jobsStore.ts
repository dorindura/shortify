// src/lib/jobsStore.ts
export type JobStatus = "pending" | "processing" | "done" | "failed";
export type JobType = "upload" | "url";
export type JobAspect = "horizontal" | "vertical" | "verticalLetterbox";
export type CaptionStyle = "boldYellow" | "subtle" | "karaoke";

export type JobStage =
    | "queued"
    | "downloading"
    | "captioning"
    | "clipping"
    | "rendering"
    | "finished";

export type Job = {
    id: string;
    ownerId: string;
    type: JobType;
    source: string;          // original file path or URL
    status: JobStatus;
    createdAt: string;
    updatedAt: string;
    aspect?: JobAspect;
    clipDurationSec?: number; // e.g. 20, 30, 45
    maxClips?: number;
    captionsEnabled?: boolean;
    captionStyle?: CaptionStyle;
    clips?: string[];        // filesystem paths to raw clips
    captionedClips?: string[]; // PUBLIC URLs to captioned shorts (e.g. /shorts/abc.mp4)
    captionedThumbs?: string[];
    stage?: JobStage;
    progress?: number; // 0–100
};

const jobs: Job[] = [];

export function listJobsByOwner(ownerId: string): Job[] {
    return jobs
        .filter((j) => j.ownerId === ownerId)
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function addJob(job: Job) {
    jobs.push(job);
}

export function listJobs(): Job[] {
    return jobs.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function updateJobStatus(id: string, status: JobStatus) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.status = status;
        job.updatedAt = new Date().toISOString();
    }
}

export function getJob(id: string) {
    return jobs.find((j) => j.id === id) ?? null;
}

export function setJobClips(id: string, clips: string[]) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.clips = clips;
        job.updatedAt = new Date().toISOString();
    }
}

export function setJobCaptionedClips(id: string, urls: string[]) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.captionedClips = urls;
        job.updatedAt = new Date().toISOString();
    }
}

export function setJobCaptionedResults(
    id: string,
    clipUrls: string[],
    thumbUrls: string[]
) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.captionedClips = clipUrls;
        job.captionedThumbs = thumbUrls;
        job.updatedAt = new Date().toISOString();
    }
}

export function updateJobStage(id: string, stage: JobStage, progress?: number) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.stage = stage;
        if (typeof progress === "number") {
            job.progress = progress;
        }
        job.updatedAt = new Date().toISOString();
    }
}

// NEW: directly update progress
export function updateJobProgress(id: string, progress: number) {
    const job = jobs.find((j) => j.id === id);
    if (job) {
        job.progress = progress;
        job.updatedAt = new Date().toISOString();
    }
}
