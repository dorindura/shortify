import type { Job } from "@lib/jobsStore";

type Props = {
  job: Job;
  isDownloading: boolean;
  downloadingKey: string | null;
  onDownload: (fileUrl: string, filename: string, key: string) => Promise<void>;
};

export default function JobResultList({ job, isDownloading, downloadingKey, onDownload }: Props) {
  if (!job.captionedClips || job.captionedClips.length === 0) return null;

  const resultLabel =
    job.jobGoal === "quote_reel"
      ? "Generated reel"
      : job.jobGoal === "multi_source_edit"
        ? "Final edited video"
        : "Captioned shorts";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{resultLabel}</span>
        <span className="text-[10px] text-slate-500">
          {job.captionedClips.length} file{job.captionedClips.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {job.captionedClips.map((url, idx) => {
          const thumb = job.captionedThumbs?.[idx];
          const title =
            job.jobGoal === "quote_reel"
              ? "Quote Reel"
              : job.jobGoal === "multi_source_edit"
                ? "Final Video"
                : `Short ${idx + 1}`;

          const filename =
            job.jobGoal === "quote_reel"
              ? "quote-reel.mp4"
              : job.jobGoal === "multi_source_edit"
                ? "multi-source-final.mp4"
                : `short-${idx + 1}.mp4`;

          const key = `${job.id}:${idx}`;
          const isThisDownloading = isDownloading && downloadingKey === key;

          return (
            <div
              key={url}
              className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/90 p-2"
            >
              {thumb && (
                <div className="relative h-20 w-12 overflow-hidden rounded-md border border-slate-800/80 bg-slate-900/90">
                  <img src={thumb} alt={title} className="h-full w-full object-cover" />
                  {(job.aspect === "vertical" || job.aspect === "verticalLetterbox") && (
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[8px] text-slate-200">
                      9:16
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-1 flex-col justify-between text-[11px]">
                <div className="font-medium text-slate-100">{title}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    onClick={() => onDownload(url, filename, key)}
                    disabled={isDownloading}
                    className="rounded-full border bg-sky-500 px-2.5 py-1 text-[10px] font-semibold text-slate-950 shadow-sm shadow-sky-500/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isThisDownloading ? "Downloading..." : "Download"}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-sky-500/80 px-2.5 py-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/10"
                  >
                    Preview
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
