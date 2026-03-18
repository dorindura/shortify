import type { Job } from "@lib/jobsStore";
import { formatDateTime } from "@utils/formats";
import JobResultList from "./JobResultList";

type Props = {
  job: Job;
  canDeleteJobs: boolean;
  deletingJobs: Record<string, boolean>;
  isDownloading: boolean;
  downloadingKey: string | null;
  onDeleteJob: (jobId: string) => Promise<void>;
  onDownload: (fileUrl: string, filename: string, key: string) => Promise<void>;
};

export default function JobCard({
  job,
  canDeleteJobs,
  deletingJobs,
  isDownloading,
  downloadingKey,
  onDeleteJob,
  onDownload,
  openReview,
}: Props) {
  const isPending = job.status === "pending";
  const isProcessing = job.status === "processing";
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isReviewStep = job.jobGoal === "shorts" && job.reviewReady;

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-950/90 p-3 text-xs shadow-sm shadow-black/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-300">{job.id.slice(0, 8)}…</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isPending
                  ? "bg-amber-500/10 text-amber-400"
                  : isProcessing
                    ? "bg-sky-500/10 text-sky-400"
                    : isDone
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {isPending && "⏳ PENDING"}
              {isProcessing && "⚙️ PROCESSING"}
              {!isPending && !isProcessing && isReviewStep && "📝 READY FOR REVIEW"}
              {isDone && !isReviewStep && "✅ DONE"}
              {isFailed && "⚠️ FAILED"}
              {!isPending && !isProcessing && !isDone && !isFailed && job.status.toUpperCase()}
            </span>
            {canDeleteJobs && (isDone || isFailed) && (
              <button
                onClick={() => onDeleteJob(job.id)}
                disabled={!!deletingJobs[job.id]}
                className="rounded-full border border-rose-500/60 px-2.5 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingJobs[job.id] ? "Deleting..." : "Delete"}
              </button>
            )}
            {job.jobGoal === "shorts" && job.reviewReady && (
              <button
                type="button"
                onClick={() => openReview(job)}
                className="rounded-full border border-emerald-500/60 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
              >
                Open Review
              </button>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
            <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 tracking-[0.14em] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              {job.type}
            </span>
            <span className="text-[10px] break-all text-slate-500">{job.source}</span>
          </div>

          <div className="mt-1 text-[10px] text-slate-500">
            Created: {formatDateTime(job.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
        {job.jobGoal && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
            Goal:{" "}
            {job.jobGoal === "summary"
              ? "Summary"
              : job.jobGoal === "quote_reel"
                ? "Quote Reel"
                : "Shorts"}
            {job.jobGoal === "summary" && job.summaryTargetSec
              ? ` (~${job.summaryTargetSec}s)`
              : job.jobGoal === "quote_reel" && job.quoteReelMeta?.recommendedDurationSec
                ? ` (~${job.quoteReelMeta.recommendedDurationSec}s)`
                : ""}
          </span>
        )}

        {job.aspect && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
            {job.aspect === "vertical"
              ? "Vertical 9:16 (Crop)"
              : job.aspect === "verticalLetterbox"
                ? "Vertical 9:16 (Bars)"
                : "Horizontal 16:9"}
          </span>
        )}

        {job.clipDurationSec && job.jobGoal === "shorts" && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
            ~{job.clipDurationSec}s clips
          </span>
        )}

        {job.maxClips && job.jobGoal === "shorts" && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
            up to {job.maxClips} clips
          </span>
        )}

        {job.captionsEnabled !== undefined && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
            {job.captionsEnabled ? "Captions: ON" : "Captions: OFF"}
            {job.captionsEnabled && job.captionStyle ? ` (${job.captionStyle})` : null}
          </span>
        )}
      </div>

      {job.quoteReelMeta?.quote && (
        <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="text-[11px] font-semibold text-slate-200">Generated quote</div>
          <div className="mt-1 text-[12px] text-slate-100 italic">“{job.quoteReelMeta.quote}”</div>
          {job.quoteReelMeta.author && (
            <div className="mt-1 text-[10px] text-slate-400">— {job.quoteReelMeta.author}</div>
          )}

          {job.quoteReelMeta.hashtags?.length ? (
            <div className="mt-2 text-[10px] text-slate-500">
              {job.quoteReelMeta.hashtags.join(" ")}
            </div>
          ) : null}
        </div>
      )}

      {job.quoteReelMeta?.instagramCaption && (
        <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-950/60 p-2">
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

      {job.stage && (
        <div className="mt-2 text-[10px] text-slate-400">
          Stage: <span className="font-semibold text-slate-200">{job.stage.toUpperCase()}</span>
          {typeof job.progress === "number" && (
            <span className="ml-1 text-slate-500">({job.progress}%)</span>
          )}
        </div>
      )}

      {typeof job.progress === "number" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
          <div
            className={`h-1.5 rounded-full transition-[width] duration-300 ${
              isFailed ? "bg-rose-500" : isDone ? "bg-emerald-500" : "bg-sky-500"
            }`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}

      {job.jobGoal === "shorts" && job.reviewReady && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-200">
          This shorts job is waiting for caption/overlay review before final render.
        </div>
      )}

      <JobResultList
        job={job}
        isDownloading={isDownloading}
        downloadingKey={downloadingKey}
        onDownload={onDownload}
      />
    </div>
  );
}
