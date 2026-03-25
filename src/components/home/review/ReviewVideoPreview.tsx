"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

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

type OverlayEmojiPlacement = "left" | "right";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
  emoji?: string | null;
  emojiPlacement?: OverlayEmojiPlacement;
};

type SmartCropSegment = {
  tStart: number;
  tEnd: number;
  centerXNorm: number;
};

type SmartCropBox = {
  segments: SmartCropSegment[];
};

type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";

type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  durationSec?: number;
  emoji?: string;
  emojiPlacement?: "left" | "right" | "center";
  position?: "top" | "center" | "bottom";
};

type Props = {
  clipUrl?: string | null;
  clipIndex: number;
  drafts: CaptionDraftClip[];
  overlays: TextOverlay[];
  captionsEnabled: boolean;
  blackAndWhite?: boolean;
  ending?: EndingConfig;
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

function getEmojiChar(emojiId?: string | null) {
  if (!emojiId) return null;
  return OVERLAY_EMOJIS.find((e) => e.id === emojiId)?.char ?? null;
}

function getEndingPreviewPositionClass(position?: "top" | "center" | "bottom") {
  switch (position) {
    case "top":
      return "items-start pt-10";
    case "center":
      return "items-center";
    case "bottom":
    default:
      return "items-end pb-14";
  }
}

function buildEndingPreviewParts(ending?: EndingConfig) {
  const text = ending?.text?.trim() ?? "";
  const emoji = ending?.emoji ?? "";

  if (!emoji && !text) return { left: "", center: "", right: "" };

  switch (ending?.emojiPlacement) {
    case "left":
      return { left: emoji, center: text, right: "" };

    case "right":
      return { left: "", center: text, right: emoji };

    case "center":
      if (!text) {
        return { left: "", center: emoji, right: "" };
      }
      return { left: "", center: `${emoji} ${text} ${emoji}`, right: "" };

    default:
      return { left: "", center: text, right: emoji };
  }
}

export default function ReviewVideoPreview({
  clipUrl,
  clipIndex,
  drafts,
  overlays,
  captionsEnabled,
  blackAndWhite,
  ending,
  onTimeChange,
  seekTo,
  onSeekHandled,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isEndingPreviewActive, setIsEndingPreviewActive] = useState(false);

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
    setIsEndingPreviewActive(false);
    onTimeChange?.(seekTo);

    video.play().catch(() => {
      // ignore autoplay restrictions
    });

    onSeekHandled?.();
  }, [seekTo, onSeekHandled, onTimeChange]);

  useEffect(() => {
    setCurrentTime(0);
    setIsEndingPreviewActive(false);
    setVideoDuration(0);
  }, [clipIndex, clipUrl]);

  const endingDuration = Math.max(0.5, Math.min(3, ending?.durationSec ?? 1.2));

  useEffect(() => {
    setIsEndingPreviewActive(false);
  }, [
    clipIndex,
    clipUrl,
    ending?.type,
    ending?.durationSec,
    ending?.text,
    ending?.subtext,
    ending?.emoji,
    ending?.emojiPlacement,
    ending?.position,
  ]);

  const endingPreview = buildEndingPreviewParts(ending);

  const fadeProgress =
    ending?.type === "fadeBlack" && videoDuration > 0
      ? Math.max(0, Math.min(1, (currentTime - (videoDuration - endingDuration)) / endingDuration))
      : 0;

  const isTimedEndingVisible =
    (ending?.type === "fadeBlack" || ending?.type === "endCard") &&
    videoDuration > 0 &&
    currentTime >= Math.max(0, videoDuration - endingDuration);

  const shouldHideRegularOverlay = isEndingPreviewActive || isTimedEndingVisible;

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
              onLoadedMetadata={(e) => {
                setVideoDuration(e.currentTarget.duration || 0);
              }}
              className="h-full w-full bg-black object-contain"
              style={{
                filter: blackAndWhite ? "grayscale(1)" : "none",
              }}
              onPlay={() => {
                if (isEndingPreviewActive) {
                  setIsEndingPreviewActive(false);
                }
              }}
              onSeeking={() => {
                if (isEndingPreviewActive) {
                  setIsEndingPreviewActive(false);
                }
              }}
              onEnded={() => {
                if (ending?.type === "freeze") {
                  setIsEndingPreviewActive(true);
                }
                setCurrentTime(videoDuration || 0);
              }}
              onTimeUpdate={(e) => {
                const video = e.currentTarget;
                const next = video.currentTime;
                const duration = video.duration || 0;

                setCurrentTime(next);
                onTimeChange?.(next);

                if (
                  ending?.type === "freeze" &&
                  duration > 0 &&
                  next >= Math.max(0, duration - endingDuration)
                ) {
                  if (!isEndingPreviewActive) {
                    const freezeAt = Math.max(0, duration - endingDuration - 0.02);

                    video.currentTime = freezeAt;
                    video.pause();

                    setCurrentTime(freezeAt);
                    setIsEndingPreviewActive(true);
                  }

                  return;
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No clip preview available
            </div>
          )}

          {captionsEnabled && activeChunk?.text && !shouldHideRegularOverlay && (
            <div className="pointer-events-none absolute inset-x-4 bottom-16 flex justify-center">
              {/*<div className="max-w-[90%] rounded-xl bg-black/55 px-4 py-2 text-center text-sm leading-relaxed font-semibold text-white shadow-lg shadow-black/40 backdrop-blur-sm">*/}
              {activeChunk.text}
              {/*</div>*/}
            </div>
          )}

          {!shouldHideRegularOverlay &&
            activeOverlays.map((overlay) => (
              <div
                key={overlay.id}
                className={`pointer-events-none absolute left-1/2 z-10 w-[82%] -translate-x-1/2 ${getOverlayPositionClass(
                  overlay.position,
                )}`}
              >
                {/*<div className="rounded-xl bg-slate-950/65 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg shadow-black/40 backdrop-blur-sm">*/}
                <div className="flex items-center justify-center gap-2">
                  {overlay.emoji && (overlay.emojiPlacement ?? "left") === "left" && (
                    <span className="text-xl leading-none">{getEmojiChar(overlay.emoji)}</span>
                  )}

                  {overlay.text && <span>{overlay.text}</span>}

                  {overlay.emoji && (overlay.emojiPlacement ?? "left") === "right" && (
                    <span className="text-xl leading-none">{getEmojiChar(overlay.emoji)}</span>
                  )}
                </div>
                {/*</div>*/}
              </div>
            ))}
          {ending?.type === "fadeBlack" && fadeProgress > 0 && (
            <>
              <div
                className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-150"
                style={{
                  backgroundColor: `rgba(0,0,0,${fadeProgress})`,
                }}
              />

              <div
                className={`pointer-events-none absolute inset-0 z-30 flex justify-center transition-opacity duration-150 ${getEndingPreviewPositionClass(
                  ending.position,
                )}`}
                style={{
                  opacity: fadeProgress,
                }}
              >
                <div className="max-w-[82%] px-4 text-center">
                  <div className="flex items-center justify-center gap-3">
                    {endingPreview.left && (
                      <span className="text-2xl leading-none">{endingPreview.left}</span>
                    )}

                    {endingPreview.center && (
                      <div className="text-xl font-extrabold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.65)]">
                        {endingPreview.center}
                      </div>
                    )}

                    {endingPreview.right && (
                      <span className="text-2xl leading-none">{endingPreview.right}</span>
                    )}
                  </div>

                  {ending.subtext && (
                    <div className="mt-1 text-xs text-slate-200 [text-shadow:0_2px_10px_rgba(0,0,0,0.55)]">
                      {ending.subtext}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {ending?.type === "endCard" && isTimedEndingVisible && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
              <div className="w-[82%] rounded-3xl border border-white/10 bg-black/40 px-6 py-8 text-center shadow-2xl">
                <div className="flex items-center justify-center gap-3">
                  {endingPreview.left && (
                    <span className="text-3xl leading-none">{endingPreview.left}</span>
                  )}

                  {endingPreview.center && (
                    <div className="text-2xl font-extrabold tracking-tight text-white">
                      {endingPreview.center}
                    </div>
                  )}

                  {endingPreview.right && (
                    <span className="text-3xl leading-none">{endingPreview.right}</span>
                  )}
                </div>

                {ending.subtext && (
                  <div className="mt-3 text-sm text-slate-300">{ending.subtext}</div>
                )}
              </div>
            </div>
          )}
          {ending?.type === "freeze" && isEndingPreviewActive && (
            <div
              className={`pointer-events-none absolute inset-0 z-20 flex justify-center transition-opacity duration-300 ${
                isEndingPreviewActive ? "opacity-100" : "opacity-0"
              } ${getEndingPreviewPositionClass(ending.position)}`}
            >
              <div className="max-w-[82%] px-4 text-center">
                <div className="flex items-center justify-center gap-3">
                  {endingPreview.left && (
                    <span className="text-2xl leading-none">{endingPreview.left}</span>
                  )}

                  {endingPreview.center && (
                    <div className="text-xl font-extrabold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.65)]">
                      {endingPreview.center}
                    </div>
                  )}

                  {endingPreview.right && (
                    <span className="text-2xl leading-none">{endingPreview.right}</span>
                  )}
                </div>

                {ending.subtext && (
                  <div className="mt-1 text-xs text-slate-200 [text-shadow:0_2px_10px_rgba(0,0,0,0.55)]">
                    {ending.subtext}
                  </div>
                )}
              </div>
            </div>
          )}
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
