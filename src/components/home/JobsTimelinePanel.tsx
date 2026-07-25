import type { Job } from "@lib/jobsStore";
import JobCard from "./JobCard";

type Props = {
  jobs: Job[];
  canDeleteJobs: boolean;
  deletingJobs: Record<string, boolean>;
  isDownloading: boolean;
  downloadingKey: string | null;
  onRefresh: () => Promise<void>;
  onDeleteJob: (jobId: string) => Promise<void>;
  openReview: (job: Job) => void;
  onDownload: (fileUrl: string, filename: string, key: string) => Promise<void>;
  youtubeConnected: boolean;
  youtubeChannelTitle: string | null;
  onConnectYoutube: () => Promise<void>;
  onDisconnectYoutube: () => Promise<void>;
  publishingJobs: Record<string, boolean>;
  onPublishYoutube: (jobId: string) => Promise<void>;
};

export default function JobsTimelinePanel({
  jobs,
  canDeleteJobs,
  deletingJobs,
  isDownloading,
  downloadingKey,
  onRefresh,
  onDeleteJob,
  onDownload,
  openReview,
  youtubeConnected,
  youtubeChannelTitle,
  onConnectYoutube,
  onDisconnectYoutube,
  publishingJobs,
  onPublishYoutube,
}: Props) {
  return (
    <aside className="mt-1 w-full lg:mt-0 lg:w-[440px]">
      <section className="sticky top-20 space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">Jobs timeline</h2>
            <p className="text-[11px] text-slate-500">
              Track downloads, clipping, face analysis & rendering.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center justify-center rounded-full border border-slate-700/90 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-900"
          >
            Refresh
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-slate-950/70 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-rose-200">YouTube</div>
            <div className="truncate text-[10px] text-slate-500">
              {youtubeConnected
                ? `Connected: ${youtubeChannelTitle ?? "channel"}`
                : "Connect a channel to publish reels"}
            </div>
          </div>
          <button
            onClick={youtubeConnected ? onDisconnectYoutube : onConnectYoutube}
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-medium transition ${
              youtubeConnected
                ? "border-slate-700 text-slate-300 hover:bg-slate-900"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            }`}
          >
            {youtubeConnected ? "Disconnect" : "Connect YouTube"}
          </button>
        </div>

        <div className="max-h-[460px] space-y-2 overflow-auto text-sm">
          {jobs.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/80 px-3 py-4 text-[12px] text-slate-400">
              No jobs yet. Paste a URL, upload a file, or generate your first Quote Reel.
            </p>
          )}

          {jobs.map((job) => (
            <JobCard
              openReview={openReview}
              key={job.id}
              job={job}
              canDeleteJobs={canDeleteJobs}
              deletingJobs={deletingJobs}
              isDownloading={isDownloading}
              downloadingKey={downloadingKey}
              onDeleteJob={onDeleteJob}
              onDownload={onDownload}
              youtubeConnected={youtubeConnected}
              isPublishing={!!publishingJobs[job.id]}
              onPublishYoutube={onPublishYoutube}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}
