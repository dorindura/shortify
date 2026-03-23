import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "./jobsStore";

export async function createJob(job: Job, sb: SupabaseClient) {
  const { error } = await sb.from("jobs").insert({
    id: job.id,
    owner_id: job.ownerId,
    type: job.type,
    source: job.source,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    aspect: job.aspect,
    clip_duration_sec: job.clipDurationSec,
    max_clips: job.maxClips,
    captions_enabled: job.captionsEnabled,
    caption_style: job.captionStyle,
    black_and_white: job.blackAndWhite ?? false,
    clips: job.clips,
    preview_clips: job.previewClips ?? null,
    captioned_clips: job.captionedClips,
    captioned_thumbs: job.captionedThumbs,
    job_goal: job.jobGoal ?? "shorts",
    summary_target_sec: job.summaryTargetSec ?? null,
    quote_prompt: job.quotePrompt ?? null,
    quote_reel_meta: job.quoteReelMeta ?? null,
    shorts_config: job.shortsConfig ?? null,
    caption_drafts: job.captionDrafts ?? null,
    text_overlays: job.textOverlays ?? null,
    review_ready: job.reviewReady ?? false,
    smart_crops: job.smartCrops ?? null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  });

  if (error) throw error;
}

export async function listJobsByOwner(ownerId: string, sb: SupabaseClient): Promise<Job[]> {
  const { data, error } = await sb
    .from("jobs")
    .select("*")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    source: row.source,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    aspect: row.aspect,
    clipDurationSec: row.clip_duration_sec,
    maxClips: row.max_clips,
    captionsEnabled: row.captions_enabled,
    captionStyle: row.caption_style,
    clips: row.clips ?? [],
    blackAndWhite: row.black_and_white ?? false,
    previewClips: row.preview_clips ?? [],
    captionedClips: row.captioned_clips ?? [],
    captionedThumbs: row.captioned_thumbs ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobGoal: row.job_goal ?? "shorts",
    summaryTargetSec: row.summary_target_sec ?? undefined,
    quotePrompt: row.quote_prompt ?? undefined,
    quoteReelMeta: row.quote_reel_meta ?? undefined,
    shortsConfig: row.shorts_config ?? undefined,
    captionDrafts: row.caption_drafts ?? undefined,
    textOverlays: row.text_overlays ?? undefined,
    reviewReady: row.review_ready ?? false,
    smartCrops: row.smart_crops ?? undefined,
  }));
}
