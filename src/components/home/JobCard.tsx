"use client";

import { useState } from "react";
import type { Job } from "@lib/jobsStore";
import { formatDateTime } from "@utils/formats";
import { isRecoverableQuoteReelRender, jobNeedsReview } from "./home.utils";
import JobResultList from "./JobResultList";

type Props = {
  job: Job;
  canDeleteJobs: boolean;
  deletingJobs: Record<string, boolean>;
  isDownloading: boolean;
  downloadingKey: string | null;
  onDeleteJob: (jobId: string) => Promise<void>;
  onDownload: (fileUrl: string, filename: string, key: string) => Promise<void>;
  openReview: (job: Job) => void;
  youtubeConnected: boolean;
  isPublishing: boolean;
  onPublishYoutube: (jobId: string) => Promise<void>;
};

const GOAL_LABEL: Record<string, string> = {
  shorts: "AI Shorts",
  summary: "Summary",
  quote_reel: "Story Reel",
  multi_source_edit: "Multi-source",
};

const THUMB_BG: Record<string, string> = {
  quote_reel: "from-fuchsia-900/70 to-indigo-950",
  multi_source_edit: "from-cyan-900/70 to-slate-950",
  shorts: "from-slate-700/70 to-slate-950",
  summary: "from-emerald-900/70 to-slate-950",
};

const GOAL_ICON: Record<string, string> = {
  quote_reel: "🎙️",
  multi_source_edit: "🎬",
  shorts: "✂️",
  summary: "🎞️",
};

function firstLine(text?: string): string {
  if (!text) return "";
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const trimmed = line.trim();
  return trimmed.length > 52 ? `${trimmed.slice(0, 52)}…` : trimmed;
}

function jobTitle(job: Job): string {
  if (job.jobGoal === "quote_reel") {
    return (
      job.quoteReelMeta?.youtube?.title ||
      job.quoteReelMeta?.angle?.workingTitle ||
      firstLine(job.quoteReelMeta?.finalScript) ||
      "Story Reel"
    );
  }
  if (job.jobGoal === "multi_source_edit") return "Multi-source edit";
  const clipTitle = job.shortsConfig?.clipTitles?.find((t) => t?.trim());
  if (clipTitle) return clipTitle;
  const src = (job.source ?? "").replace(/^https?:\/\/(www\.)?/, "");
  return src || GOAL_LABEL[job.jobGoal ?? "shorts"] || "AI Shorts";
}

function aspectShort(aspect?: string): string | null {
  if (!aspect) return null;
  if (aspect === "vertical") return "9:16";
  if (aspect === "verticalLetterbox") return "9:16 bars";
  if (aspect === "verticalFit") return "9:16 fit";
  return "16:9";
}

export default function JobCard({
  job,
  canDeleteJobs,
  deletingJobs,
  isDownloading,
  downloadingKey,
  onDeleteJob,
  onDownload,
  openReview,
  youtubeConnected,
  isPublishing,
  onPublishYoutube,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isPending = job.status === "pending";
  const isProcessing = job.status === "processing";
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isDeleting = !!deletingJobs[job.id];

  async function confirmDelete() {
    await onDeleteJob(job.id);
    // If the delete fails, keep the card; the parent re-fetches on success.
    setConfirmingDelete(false);
  }

  const recoverable = isRecoverableQuoteReelRender(job);
  const isReviewStep = jobNeedsReview(job);
  const isQuoteReelScriptReviewStep =
    job.jobGoal === "quote_reel" && (job.reviewReady || recoverable);

  const yt = job.quoteReelMeta?.youtube;
  const canPublish = isDone && !!yt?.title && !yt?.publishedUrl && job.jobGoal === "quote_reel";

  const title = jobTitle(job);
  const goalLabel = GOAL_LABEL[job.jobGoal ?? "shorts"] ?? "Shorts";
  const durationLabel =
    job.jobGoal === "quote_reel"
      ? job.quoteReelMeta?.actualDurationSec || job.quoteReelMeta?.targetDurationSec
        ? `${Math.round(
            job.quoteReelMeta?.actualDurationSec ?? job.quoteReelMeta?.targetDurationSec ?? 0,
          )}s`
        : null
      : job.jobGoal === "shorts" && job.maxClips
        ? `${job.maxClips} clip${job.maxClips > 1 ? "s" : ""}`
        : null;

  const metaBits = [goalLabel, aspectShort(job.aspect), durationLabel].filter(Boolean) as string[];

  const statusChip = (() => {
    if (recoverable)
      return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">📝 RESUME</span>;
    if (isReviewStep)
      return (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">
          {isQuoteReelScriptReviewStep ? "📝 SCRIPT REVIEW" : "📝 REVIEW"}
        </span>
      );
    if (isPending)
      return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">⏳ PENDING</span>;
    if (isProcessing)
      return (
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sky-300">
          ⚙️ {job.stage ? job.stage.toUpperCase() : "PROCESSING"}
          {typeof job.progress === "number" ? ` · ${job.progress}%` : ""}
        </span>
      );
    if (isDone)
      return <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">✓ DONE</span>;
    if (isFailed)
      return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-300">⚠️ FAILED</span>;
    return null;
  })();

  const primaryAction = (() => {
    if (isReviewStep) {
      return (
        <button
          type="button"
          onClick={() => openReview(job)}
          className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-emerald-300 hover:bg-emerald-500/20"
        >
          {recoverable ? "Resume render" : isQuoteReelScriptReviewStep ? "Edit script" : "Open review"}
        </button>
      );
    }
    if (canPublish) {
      return (
        <button
          type="button"
          onClick={() => onPublishYoutube(job.id)}
          disabled={!youtubeConnected || isPublishing}
          title={youtubeConnected ? "Upload to your connected channel" : "Connect YouTube first"}
          className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPublishing ? "Publishing…" : "Publish ▸ YT"}
        </button>
      );
    }
    return null;
  })();

  const hasDetails =
    job.jobGoal === "quote_reel" ||
    !!job.quoteReelMeta?.posterUrl ||
    !!job.quoteReelMeta?.instagramCaption ||
    !!yt?.title ||
    !!job.source;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/90 p-2.5 text-xs shadow-sm shadow-black/40 transition hover:border-slate-700 ${
        confirmingDelete ? "min-h-[140px]" : ""
      }`}
    >
      {confirmingDelete && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-xl border border-rose-500/40 bg-slate-950/95 p-4 text-center backdrop-blur-sm">
          <div className="text-sm font-semibold text-rose-200">Delete this job permanently?</div>
          <div className="max-w-[15rem] text-[11px] text-slate-400">
            “{title}” and its rendered files will be removed for good. This can’t be undone.
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="rounded-lg border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? "Deleting…" : "Delete for good"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {/* Thumbnail */}
        <div
          className={`relative h-[62px] w-[46px] shrink-0 overflow-hidden rounded-lg border border-slate-800/80 bg-gradient-to-br ${
            THUMB_BG[job.jobGoal ?? "shorts"] ?? THUMB_BG.shorts
          }`}
        >
          <span className="absolute inset-0 grid place-items-center text-lg opacity-80">
            {GOAL_ICON[job.jobGoal ?? "shorts"] ?? GOAL_ICON.shorts}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="line-clamp-2 font-semibold break-words text-slate-100">{title}</div>
            {canDeleteJobs && (isDone || isFailed) && (
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={isDeleting}
                aria-label="Delete job"
                title="Delete job"
                className="shrink-0 rounded-md px-1 text-slate-600 transition hover:text-rose-300 disabled:opacity-50"
              >
                {isDeleting ? "…" : "✕"}
              </button>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
            {metaBits.map((bit, i) => (
              <span key={bit + i} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-700">·</span>}
                {bit}
              </span>
            ))}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {statusChip}
            {primaryAction}
          </div>
        </div>
      </div>

      {/* Progress bar while active */}
      {typeof job.progress === "number" && (isPending || isProcessing) && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-900">
          <div
            className={`h-1 rounded-full transition-[width] duration-300 ${
              isFailed ? "bg-rose-500" : "bg-gradient-to-r from-sky-500 to-cyan-400"
            }`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}

      {/* Results (downloads / previews) */}
      <JobResultList
        job={job}
        isDownloading={isDownloading}
        downloadingKey={downloadingKey}
        onDownload={onDownload}
      />

      {/* Everything else, collapsed */}
      {hasDetails && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
            Details &amp; captions
            <span className="transition group-open:rotate-90">›</span>
          </summary>

          <div className="mt-2 space-y-3">
            <div className="text-[10px] break-all text-slate-500">
              <span className="font-mono">{job.id.slice(0, 8)}…</span> · {job.source}
              <div className="mt-0.5">Created {formatDateTime(job.createdAt)}</div>
            </div>

            {job.jobGoal === "quote_reel" && (
              <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-slate-200">Story Reel</div>
                  {job.quoteReelMeta?.voiceover?.enabled && (
                    <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] text-fuchsia-200">
                      Voice:{" "}
                      {job.quoteReelMeta?.voiceover?.voicePreset ??
                        job.quoteReelMeta?.voicePreset ??
                        "on"}
                    </span>
                  )}
                </div>

                {job.quoteReelMeta?.finalScript && (
                  <div className="mt-2 text-[11px] text-slate-300">
                    <div className="mb-1 text-[10px] font-semibold text-slate-400">
                      Script preview
                    </div>
                    <div className="line-clamp-5 whitespace-pre-wrap text-slate-200">
                      {job.quoteReelMeta.finalScript}
                    </div>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                  {job.quoteReelMeta?.mode && (
                    <span className="rounded-full bg-slate-950/80 px-2 py-0.5">
                      Mode: {job.quoteReelMeta.mode === "manual_text" ? "Manual text" : "AI prompt"}
                    </span>
                  )}
                  {job.quoteReelMeta?.tone && (
                    <span className="rounded-full bg-slate-950/80 px-2 py-0.5">
                      Tone: {job.quoteReelMeta.tone}
                    </span>
                  )}
                  {job.quoteReelMeta?.segments?.length ? (
                    <span className="rounded-full bg-slate-950/80 px-2 py-0.5">
                      {job.quoteReelMeta.segments.length} segments
                    </span>
                  ) : null}
                  {job.quoteReelMeta?.selectedAssets?.length ? (
                    <span className="rounded-full bg-slate-950/80 px-2 py-0.5">
                      {job.quoteReelMeta.selectedAssets.length} video picks
                    </span>
                  ) : null}
                </div>

                {job.quoteReelMeta?.angle && (
                  <div className="mt-2 rounded-lg border border-emerald-500/20 bg-slate-950/60 p-2">
                    <div className="text-[10px] font-semibold text-emerald-200">
                      Angle: {job.quoteReelMeta.angle.angleFormat} · {job.quoteReelMeta.angle.theme}{" "}
                      · {job.quoteReelMeta.angle.register}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {job.quoteReelMeta.angle.premise}
                    </div>
                  </div>
                )}

                {job.quoteReelMeta?.hashtags?.length ? (
                  <div className="mt-2 text-[10px] text-slate-500">
                    {job.quoteReelMeta.hashtags.join(" ")}
                  </div>
                ) : null}
              </div>
            )}

            {job.quoteReelMeta?.posterUrl && (
              <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-slate-300">TikTok poster</div>
                  <a
                    href={job.quoteReelMeta.posterUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] text-slate-300 hover:bg-slate-900"
                  >
                    Download
                  </a>
                </div>
                <a href={job.quoteReelMeta.posterUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={job.quoteReelMeta.posterUrl}
                    alt={job.quoteReelMeta.posterQuote ?? "Quote poster"}
                    className="mt-2 w-28 rounded-md border border-slate-800"
                  />
                </a>
                {job.quoteReelMeta.posterQuote && (
                  <div className="mt-1 text-[10px] text-slate-400 italic">
                    “{job.quoteReelMeta.posterQuote}”
                  </div>
                )}
              </div>
            )}

            {job.quoteReelMeta?.instagramCaption && (
              <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-slate-300">Instagram caption</div>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(job.quoteReelMeta?.instagramCaption ?? "")
                    }
                    className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] text-slate-300 hover:bg-slate-900"
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-1 text-[10px] whitespace-pre-wrap text-slate-400">
                  {job.quoteReelMeta.instagramCaption}
                </div>
              </div>
            )}

            {yt?.title && (
              <div className="rounded-lg border border-rose-500/20 bg-slate-950/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-rose-200">YouTube metadata</div>
                  <button
                    type="button"
                    onClick={() => {
                      const block = [
                        `TITLE: ${yt.title}`,
                        yt.titleVariants?.length ? `ALT: ${yt.titleVariants.join(" | ")}` : "",
                        "",
                        yt.description,
                        "",
                        yt.tags?.length ? `TAGS: ${yt.tags.join(", ")}` : "",
                        yt.hashtags?.length ? `HASHTAGS: ${yt.hashtags.join(" ")}` : "",
                        yt.pinnedComment ? `PINNED: ${yt.pinnedComment}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      navigator.clipboard.writeText(block);
                    }}
                    className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] text-slate-300 hover:bg-slate-900"
                  >
                    Copy all
                  </button>
                </div>

                <div className="mt-1 text-[11px] font-semibold text-slate-100">{yt.title}</div>

                {yt.description && (
                  <div className="mt-2 text-[10px] whitespace-pre-wrap text-slate-400">
                    {yt.description}
                  </div>
                )}

                {yt.hashtags?.length ? (
                  <div className="mt-1 text-[10px] font-medium text-rose-300/80">
                    {yt.hashtags.join(" ")}
                  </div>
                ) : null}

                {yt.pinnedComment && (
                  <div className="mt-2 text-[10px] text-slate-400 italic">📌 {yt.pinnedComment}</div>
                )}

                {yt.publishedUrl && (
                  <a
                    href={yt.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
                  >
                    ✓ Published ({yt.privacyStatus ?? "private"}) — open on YouTube
                  </a>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
