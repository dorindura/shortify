import { supabaseAdmin } from "@/lib/supabase/admin";
import type { JobStage, JobStatus } from "@/lib/jobsStore";

export async function dbGetJob(jobId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();

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

export async function dbSetJobCaptionedResults(
  jobId: string,
  clipUrls: string[],
  thumbUrls: string[],
) {
  return dbUpdateJob(jobId, {
    captioned_clips: clipUrls,
    captioned_thumbs: thumbUrls,
  });
}

export async function dbUpdateJobQuoteMeta(jobId: string, quoteReelMeta: any) {
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("jobs")
    .update({
      quote_reel_meta: quoteReelMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw error;
}

export async function dbSetJobCaptionDrafts(jobId: string, captionDrafts: any) {
  return dbUpdateJob(jobId, { caption_drafts: captionDrafts });
}

export async function dbSetJobTextOverlays(jobId: string, textOverlays: any) {
  return dbUpdateJob(jobId, { text_overlays: textOverlays });
}

export async function dbSetJobReviewReady(jobId: string, reviewReady: boolean) {
  return dbUpdateJob(jobId, { review_ready: reviewReady });
}

export async function dbSetJobSmartCrops(jobId: string, smartCrops: any) {
  return dbUpdateJob(jobId, { smart_crops: smartCrops });
}

export async function dbSetJobPreviewClips(jobId: string, previewClips: string[]) {
  return dbUpdateJob(jobId, { preview_clips: previewClips });
}

export async function dbSetMultiSourceEditConfig(jobId: string, config: any) {
  return dbUpdateJob(jobId, { multi_source_edit_config: config });
}

export async function dbSetMultiSourceDraftVideoUrl(jobId: string, draftVideoUrl: string) {
  const job = await dbGetJob(jobId);
  const current = job?.multi_source_edit_config ?? {};

  return dbUpdateJob(jobId, {
    multi_source_edit_config: {
      ...current,
      draftVideoUrl,
    },
  });
}

export async function dbSetMultiSourceReviewConfig(jobId: string, reviewConfig: any) {
  const job = await dbGetJob(jobId);
  const current = job?.multi_source_edit_config ?? {};

  return dbUpdateJob(jobId, {
    multi_source_edit_config: {
      ...current,
      reviewConfig,
    },
  });
}

export async function dbSetMultiSourceFinalVideoUrl(jobId: string, finalVideoUrl: string) {
  const job = await dbGetJob(jobId);
  const current = job?.multi_source_edit_config ?? {};

  return dbUpdateJob(jobId, {
    multi_source_edit_config: {
      ...current,
      finalVideoUrl,
    },
  });
}
