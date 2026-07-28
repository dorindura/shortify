import type { Job } from "@lib/jobsStore";
import type { CustomRange, MultiSourceInput, MultiSourceSegmentDraft } from "./home.types";

/**
 * Resolve a stored asset URL into something the browser can render.
 *
 * - Plain http(s) / relative URLs pass through unchanged.
 * - `local:` URLs (used when LOCAL_RENDER_OUTPUTS=true) point at an absolute
 *   path on disk. When that path lives under the app's `public/` directory it is
 *   served by Next at the corresponding web path (e.g. `/thumbs/abc.jpg`), so we
 *   rewrite it. Anything outside `public/` can't be served, so we return null.
 */
export function resolveAssetUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("local:")) return raw;

  const diskPath = raw.slice("local:".length).replace(/\\/g, "/");
  const marker = "/public/";
  const idx = diskPath.lastIndexOf(marker);
  if (idx === -1) return null;

  return diskPath.slice(idx + marker.length - 1); // keep leading slash: "/thumbs/abc.jpg"
}

/** First browser-renderable thumbnail for a job, if any. */
export function resolveJobThumb(job: Job): string | null {
  for (const raw of job.captionedThumbs ?? []) {
    const resolved = resolveAssetUrl(raw);
    if (resolved) return resolved;
  }
  return resolveAssetUrl(job.quoteReelMeta?.posterUrl);
}

export function isRecoverableQuoteReelRender(job: Job): boolean {
  const hasScript = (job.quoteReelMeta?.finalScript ?? "").trim().length >= 20;
  return (
    job.jobGoal === "quote_reel" &&
    job.status === "pending" &&
    job.stage === "queued" &&
    hasScript
  );
}

export function jobNeedsReview(job: Job): boolean {
  const shortsReview = job.jobGoal === "shorts" && !!job.reviewReady;
  const multiReview = job.jobGoal === "multi_source_edit" && !!job.reviewReady;
  const quoteReview =
    job.jobGoal === "quote_reel" && (!!job.reviewReady || isRecoverableQuoteReelRender(job));
  return shortsReview || multiReview || quoteReview;
}

export type JobGroup = "review" | "working" | "done" | "failed";

export function jobGroup(job: Job): JobGroup {
  if (jobNeedsReview(job)) return "review";
  if (job.status === "failed") return "failed";
  if (job.status === "done") return "done";
  return "working";
}

export function parseTimeToSeconds(input: string): number | null {
  const value = input.trim();

  if (!value) return null;

  if (value.includes(":")) {
    const parts = value.split(":").map((part) => part.trim());

    if (parts.length !== 2) return null;

    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

    return minutes * 60 + seconds;
  }

  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

  return totalSeconds;
}

export function buildCustomRangesPayload(customRanges: CustomRange[]) {
  return customRanges
    .map((clip) => {
      const ranges = clip.ranges
        .map((range) => ({
          id: range.id,
          startSec: parseTimeToSeconds(range.startSec),
          endSec: parseTimeToSeconds(range.endSec),
        }))
        .filter(
          (
            range,
          ): range is {
            id: string;
            startSec: number;
            endSec: number;
          } =>
            typeof range.startSec === "number" &&
            typeof range.endSec === "number" &&
            Number.isFinite(range.startSec) &&
            Number.isFinite(range.endSec) &&
            range.endSec > range.startSec &&
            range.endSec - range.startSec >= 0.6,
        );

      return {
        id: clip.id,
        ranges,
      };
    })
    .filter(
      (
        clip,
      ): clip is {
        id: string;
        ranges: {
          id: string;
          startSec: number;
          endSec: number;
        }[];
      } => clip.ranges.length > 0,
    );
}

export function buildMultiSourceSegmentsPayload(
  sources: MultiSourceInput[],
  segments: MultiSourceSegmentDraft[],
) {
  const sourceMap = new Map(sources.map((source) => [source.id, source.url.trim()]));

  return segments
    .map((segment) => {
      const url = sourceMap.get(segment.sourceId)?.trim() ?? "";

      return {
        id: segment.id,
        sourceId: segment.sourceId,
        url,
        startSec: parseTimeToSeconds(segment.startSec),
        endSec: parseTimeToSeconds(segment.endSec),
        order: segment.order,
      };
    })
    .filter(
      (
        segment,
      ): segment is {
        id: string;
        sourceId: string;
        url: string;
        startSec: number;
        endSec: number;
        order: number;
      } =>
        !!segment.id &&
        !!segment.sourceId &&
        !!segment.url &&
        typeof segment.startSec === "number" &&
        typeof segment.endSec === "number" &&
        Number.isFinite(segment.startSec) &&
        Number.isFinite(segment.endSec) &&
        segment.endSec > segment.startSec &&
        segment.endSec - segment.startSec >= 0.6 &&
        Number.isFinite(segment.order),
    )
    .sort((a, b) => a.order - b.order);
}
