import { supabaseAdmin } from "@/lib/supabase/admin";
import type { JobStatus, JobStage } from "@/lib/jobsStore";

export async function dbGetJob(jobId: string) {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();

    if (error) return null;
    return data;
}

export async function dbUpdateJob(jobId: string, patch: Record<string, any>) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
        .from("jobs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    if (error) throw error;
}

export async function dbUpdateJobStatus(jobId: string, status: JobStatus) {
    return dbUpdateJob(jobId, { status });
}

export async function dbUpdateJobStage(jobId: string, stage: JobStage, progress?: number) {
    const patch: Record<string, any> = { stage };
    if (typeof progress === "number") patch.progress = progress;
    return dbUpdateJob(jobId, patch);
}

export async function dbSetJobClips(jobId: string, clips: string[]) {
    return dbUpdateJob(jobId, { clips });
}

export async function dbSetJobCaptionedResults(jobId: string, clipUrls: string[], thumbUrls: string[]) {
    return dbUpdateJob(jobId, { captioned_clips: clipUrls, captioned_thumbs: thumbUrls });
}
