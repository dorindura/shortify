"use client";

import { useState } from "react";
import type { Job } from "@lib/jobsStore";
import JobCard from "./JobCard";
import { jobGroup, type JobGroup } from "./home.utils";

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

type Filter = "all" | "active" | "done";

const GROUP_ORDER: JobGroup[] = ["review", "working", "done", "failed"];
const GROUP_LABEL: Record<JobGroup, string> = {
  review: "Needs you",
  working: "Working",
  done: "Done",
  failed: "Failed",
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
  const [filter, setFilter] = useState<Filter>("all");

  const grouped: Record<JobGroup, Job[]> = {
    review: [],
    working: [],
    done: [],
    failed: [],
  };
  for (const job of jobs) grouped[jobGroup(job)].push(job);

  const visibleGroups = GROUP_ORDER.filter((group) => {
    if (grouped[group].length === 0) return false;
    if (filter === "active") return group === "review" || group === "working";
    if (filter === "done") return group === "done" || group === "failed";
    return true;
  });

  const needsCount = grouped.review.length;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-50">
          Jobs
          {needsCount > 0 && (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              {needsCount} need{needsCount === 1 ? "s" : ""} you
            </span>
          )}
        </h2>
        <button
          onClick={onRefresh}
          className="rounded-full border border-slate-700/90 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-900"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/70 p-1">
        {(["all", "active", "done"] as Filter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`flex-1 rounded-full px-3 py-1 text-[11px] font-medium capitalize transition ${
              filter === option
                ? "bg-slate-800 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {option}
          </button>
        ))}
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

      <div className="max-h-[520px] space-y-4 overflow-auto pr-1 text-sm">
        {jobs.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/80 px-3 py-4 text-[12px] text-slate-400">
            No jobs yet. Pick a goal, add a source, and generate your first one.
          </p>
        )}

        {jobs.length > 0 && visibleGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/80 px-3 py-4 text-[12px] text-slate-400">
            Nothing in this filter.
          </p>
        )}

        {visibleGroups.map((group) => (
          <div key={group} className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
              {GROUP_LABEL[group]}
              <span className="text-slate-600">· {grouped[group].length}</span>
            </div>

            {grouped[group].map((job) => (
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
        ))}
      </div>
    </section>
  );
}
