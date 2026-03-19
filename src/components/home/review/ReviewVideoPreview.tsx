"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CaptionDraftWord = {
  text: string;
  startSec: number;
  endSec: number;
};

type CaptionDraftChunk = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words?: CaptionDraftWord[];
};

type CaptionDraftClip = {
  clipIndex: number;
  chunks: CaptionDraftChunk[];
};

type TextOverlayPosition = "top" | "center" | "bottom";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
};

type SmartCropSegment = {
  tStart: number;
  tEnd: number;
  centerXNorm: number;
};

type SmartCropBox = {
  segments: SmartCropSegment[];
};

type Props = {
  clipUrl?: string | null;
  clipIndex: number;
  drafts: CaptionDraftClip[];
  overlays: TextOverlay[];
  captionsEnabled: boolean;
  aspect?: "horizontal" | "vertical" | "verticalLetterbox";
  smartCrops?: (SmartCropBox | null)[];
  onTimeChange?: (time: number) => void;
  seekTo?: number | null;
  onSeekHandled?: () => void;
};

function getOverlayPositionClass(position: TextOverlayPosition) {
  if (position === "top") return "top-8";
  if (position === "center") return "top-1/2 -translate-y-1/2";
  return "bottom-8";
}

export default function ReviewVideoPreview({
  clipUrl,
  clipIndex,
  drafts,
  overlays,
  captionsEnabled,
  onTimeChange,
  seekTo,
  onSeekHandled,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const currentClipDraft = useMemo(
    () => drafts.find((clip) => clip.clipIndex === clipIndex) ?? null,
    [drafts, clipIndex],
  );

  const activeChunk = useMemo(() => {
    const chunks = currentClipDraft?.chunks ?? [];
    const EPS = 0.08;

    return (
      chunks.find(
        (chunk) => currentTime >= chunk.startSec - EPS && currentTime < chunk.endSec + EPS,
      ) ?? null
    );
  }, [currentClipDraft, currentTime]);

  const activeOverlays = useMemo(() => {
    return overlays.filter(
      (overlay) =>
        overlay.clipIndex === clipIndex &&
        currentTime >= overlay.startSec &&
        currentTime <= overlay.endSec,
    );
  }, [overlays, clipIndex, currentTime]);

  useEffect(() => {
    if (seekTo == null) return;
    if (!videoRef.current) return;

    const video = videoRef.current;
    video.currentTime = seekTo;
    setCurrentTime(seekTo);
    onTimeChange?.(seekTo);

    video.play().catch(() => {
      // ignore autoplay restrictions
    });

    onSeekHandled?.();
  }, [seekTo, onSeekHandled, onTimeChange]);

  useEffect(() => {
    setCurrentTime(0);
  }, [clipIndex, clipUrl]);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Live preview</div>
          <div className="text-[10px] text-slate-500">
            Preview current captions and overlays before final render
          </div>
        </div>

        <div className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-[10px] text-slate-300">
          Clip {clipIndex + 1}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-black">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[420px] bg-black">
          {clipUrl ? (
            <video
              ref={videoRef}
              src={clipUrl}
              controls
              className="h-full w-full bg-black object-contain"
              onTimeUpdate={(e) => {
                const next = e.currentTarget.currentTime;
                setCurrentTime(next);
                onTimeChange?.(next);
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No clip preview available
            </div>
          )}

          {captionsEnabled && activeChunk?.text && (
            <div className="pointer-events-none absolute inset-x-4 bottom-16 flex justify-center">
              <div className="max-w-[90%] rounded-xl bg-black/55 px-4 py-2 text-center text-sm leading-relaxed font-semibold text-white shadow-lg shadow-black/40 backdrop-blur-sm">
                {activeChunk.text}
              </div>
            </div>
          )}

          {activeOverlays.map((overlay) => (
            <div
              key={overlay.id}
              className={`pointer-events-none absolute left-1/2 z-10 w-[82%] -translate-x-1/2 ${getOverlayPositionClass(
                overlay.position,
              )}`}
            >
              <div className="rounded-xl bg-slate-950/65 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg shadow-black/40 backdrop-blur-sm">
                {overlay.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span>Current time: {currentTime.toFixed(2)}s</span>
        <span>
          {activeChunk ? `Active chunk: ${activeChunk.id.slice(0, 6)}…` : "No active chunk"}
        </span>
      </div>
    </div>
  );
}
