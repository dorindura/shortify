"use client";

import { useMemo, useState } from "react";

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

type Props = {
  drafts: CaptionDraftClip[];
  selectedClipIndex: number;
  durationSec: number;
  currentTime: number;
  onSelectClip: (clipIndex: number) => void;
  onSeek: (time: number) => void;
  onEditSeek?: (time: number) => void;
  onChange: (next: CaptionDraftClip[]) => void;
};

const REAL_TIME_PX_PER_SECOND = 96;
const TRACK_PADDING_X = 32;
const BLOCK_GAP_PX = 8;

const MIN_BLOCK_WIDTH = 178;
const LONG_TEXT_EXTRA_WIDTH = 46;
const MAX_BLOCK_WIDTH = 280;

const BLOCK_TOP = 78;
const TRACK_HEIGHT = 188;
const PLAYHEAD_KNOB_RADIUS = 6;

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";

  const safe = Math.max(0, sec);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 10);

  return `${minutes}:${String(seconds).padStart(2, "0")}.${ms}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getReadableBlockWidth(chunk: CaptionDraftChunk) {
  const duration = Math.max(0.05, chunk.endSec - chunk.startSec);
  const durationWidth = duration * REAL_TIME_PX_PER_SECOND;

  const textLengthBonus =
    chunk.text.length > 70
      ? LONG_TEXT_EXTRA_WIDTH * 2
      : chunk.text.length > 42
        ? LONG_TEXT_EXTRA_WIDTH
        : 0;

  return clamp(
    Math.max(MIN_BLOCK_WIDTH + textLengthBonus, durationWidth),
    MIN_BLOCK_WIDTH,
    MAX_BLOCK_WIDTH,
  );
}

export default function CaptionTimelineEditor({
  drafts,
  selectedClipIndex,
  durationSec,
  currentTime,
  onSelectClip,
  onSeek,
  onEditSeek,
  onChange,
}: Props) {
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const currentClip = useMemo(
    () => drafts.find((clip) => clip.clipIndex === selectedClipIndex) ?? null,
    [drafts, selectedClipIndex],
  );

  const chunks = useMemo(() => {
    return [...(currentClip?.chunks ?? [])]
      .map((chunk) => ({
        ...chunk,
        startSec: Math.max(0, Number(chunk.startSec) || 0),
        endSec: Math.max(0, Number(chunk.endSec) || 0),
      }))
      .filter((chunk) => chunk.endSec > chunk.startSec)
      .sort((a, b) => a.startSec - b.startSec);
  }, [currentClip]);

  const safeDuration = Math.max(durationSec, chunks[chunks.length - 1]?.endSec ?? 1, 1);

  const visualChunks = useMemo(() => {
    let cursorX = TRACK_PADDING_X;

    return chunks.map((chunk, index) => {
      const width = getReadableBlockWidth(chunk);
      const left = cursorX;
      const right = left + width;

      cursorX = right + BLOCK_GAP_PX;

      return {
        chunk,
        index,
        left,
        right,
        width,
      };
    });
  }, [chunks]);

  const firstChunk = visualChunks[0] ?? null;
  const lastChunk = visualChunks[visualChunks.length - 1] ?? null;

  const trackWidth = Math.max(
    720,
    lastChunk ? lastChunk.right + TRACK_PADDING_X : safeDuration * REAL_TIME_PX_PER_SECOND,
  );

  function timeToX(time: number) {
    const safeTime = clamp(time, 0, safeDuration);

    if (!visualChunks.length) {
      return TRACK_PADDING_X + safeTime * REAL_TIME_PX_PER_SECOND;
    }

    if (firstChunk && safeTime <= firstChunk.chunk.startSec) {
      const startTime = firstChunk.chunk.startSec;

      if (startTime <= 0) return firstChunk.left;

      const ratio = safeTime / startTime;
      return TRACK_PADDING_X + ratio * Math.max(0, firstChunk.left - TRACK_PADDING_X);
    }

    for (let i = 0; i < visualChunks.length; i++) {
      const current = visualChunks[i];
      const next = visualChunks[i + 1];

      if (safeTime >= current.chunk.startSec && safeTime <= current.chunk.endSec) {
        const ratio =
          (safeTime - current.chunk.startSec) /
          Math.max(0.01, current.chunk.endSec - current.chunk.startSec);

        return current.left + ratio * current.width;
      }

      if (next && safeTime > current.chunk.endSec && safeTime < next.chunk.startSec) {
        const gapDuration = Math.max(0.01, next.chunk.startSec - current.chunk.endSec);
        const ratio = (safeTime - current.chunk.endSec) / gapDuration;

        return current.right + ratio * Math.max(BLOCK_GAP_PX, next.left - current.right);
      }
    }

    if (lastChunk) {
      if (safeTime <= lastChunk.chunk.endSec) {
        const ratio =
          (safeTime - lastChunk.chunk.startSec) /
          Math.max(0.01, lastChunk.chunk.endSec - lastChunk.chunk.startSec);

        return lastChunk.left + ratio * lastChunk.width;
      }

      const remainingDuration = Math.max(0.01, safeDuration - lastChunk.chunk.endSec);
      const remainingWidth = Math.max(
        TRACK_PADDING_X,
        trackWidth - TRACK_PADDING_X - lastChunk.right,
      );
      const ratio = (safeTime - lastChunk.chunk.endSec) / remainingDuration;

      return lastChunk.right + clamp(ratio, 0, 1) * remainingWidth;
    }

    return TRACK_PADDING_X;
  }

  function xToTime(x: number) {
    const safeX = clamp(x, TRACK_PADDING_X, trackWidth - TRACK_PADDING_X);

    if (!visualChunks.length) {
      const usableWidth = Math.max(1, trackWidth - TRACK_PADDING_X * 2);
      return clamp(((safeX - TRACK_PADDING_X) / usableWidth) * safeDuration, 0, safeDuration);
    }

    if (firstChunk && safeX < firstChunk.left) {
      const visualGap = Math.max(1, firstChunk.left - TRACK_PADDING_X);
      const ratio = (safeX - TRACK_PADDING_X) / visualGap;
      return clamp(ratio * firstChunk.chunk.startSec, 0, firstChunk.chunk.startSec);
    }

    for (let i = 0; i < visualChunks.length; i++) {
      const current = visualChunks[i];
      const next = visualChunks[i + 1];

      if (safeX >= current.left && safeX <= current.right) {
        const ratio = (safeX - current.left) / Math.max(1, current.width);

        return clamp(
          current.chunk.startSec + ratio * (current.chunk.endSec - current.chunk.startSec),
          current.chunk.startSec,
          current.chunk.endSec,
        );
      }

      if (next && safeX > current.right && safeX < next.left) {
        const gapWidth = Math.max(1, next.left - current.right);
        const ratio = (safeX - current.right) / gapWidth;

        return clamp(
          current.chunk.endSec + ratio * (next.chunk.startSec - current.chunk.endSec),
          current.chunk.endSec,
          next.chunk.startSec,
        );
      }
    }

    if (lastChunk) {
      if (safeX <= lastChunk.right) {
        return lastChunk.chunk.endSec;
      }

      const remainingWidth = Math.max(1, trackWidth - TRACK_PADDING_X - lastChunk.right);
      const ratio = (safeX - lastChunk.right) / remainingWidth;

      return clamp(
        lastChunk.chunk.endSec + ratio * Math.max(0, safeDuration - lastChunk.chunk.endSec),
        lastChunk.chunk.endSec,
        safeDuration,
      );
    }

    return 0;
  }

  const timeMarkers = useMemo(() => {
    const markers: number[] = [];

    const markerStep =
      safeDuration <= 30 ? 5 : safeDuration <= 90 ? 10 : safeDuration <= 180 ? 15 : 30;

    for (let time = 0; time <= safeDuration; time += markerStep) {
      markers.push(time);
    }

    const roundedLastMarker = markers[markers.length - 1] ?? 0;

    if (Math.abs(roundedLastMarker - safeDuration) > 0.05) {
      markers.push(safeDuration);
    }

    return markers;
  }, [safeDuration]);

  const editingChunk = useMemo(
    () => chunks.find((chunk) => chunk.id === editingChunkId) ?? null,
    [chunks, editingChunkId],
  );

  function seekToChunk(chunk: CaptionDraftChunk) {
    onSeek(chunk.startSec);
  }

  function openChunkEditor(chunk: CaptionDraftChunk) {
    setEditingChunkId(chunk.id);
    setDraftText(chunk.text);

    if (onEditSeek) {
      onEditSeek(chunk.startSec);
      return;
    }

    onSeek(chunk.startSec);
  }

  function closeEditor() {
    const startSec = editingChunk?.startSec;

    setEditingChunkId(null);
    setDraftText("");

    if (typeof startSec === "number") {
      onSeek(startSec);
    }
  }

  function saveChunkText() {
    if (!editingChunk || !currentClip) return;

    const startSec = editingChunk.startSec;

    onChange(
      drafts.map((clip) =>
        clip.clipIndex !== selectedClipIndex
          ? clip
          : {
              ...clip,
              chunks: clip.chunks.map((chunk) =>
                chunk.id === editingChunk.id
                  ? {
                      ...chunk,
                      text: draftText.replace(/\s+/g, " ").trim(),
                    }
                  : chunk,
              ),
            },
      ),
    );

    setEditingChunkId(null);
    setDraftText("");
    onSeek(startSec);
  }

  function updateChunkTime(field: "startSec" | "endSec", value: string) {
    if (!editingChunk || !currentClip) return;

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    onChange(
      drafts.map((clip) =>
        clip.clipIndex !== selectedClipIndex
          ? clip
          : {
              ...clip,
              chunks: clip.chunks.map((chunk) => {
                if (chunk.id !== editingChunk.id) return chunk;

                const nextStart =
                  field === "startSec"
                    ? clamp(numericValue, 0, Math.max(0, chunk.endSec - 0.05))
                    : chunk.startSec;

                const nextEnd =
                  field === "endSec"
                    ? clamp(numericValue, chunk.startSec + 0.05, safeDuration)
                    : chunk.endSec;

                return {
                  ...chunk,
                  startSec: nextStart,
                  endSec: nextEnd,
                  words: undefined,
                };
              }),
            },
      ),
    );
  }

  const playheadX = clamp(
    timeToX(currentTime),
    TRACK_PADDING_X + PLAYHEAD_KNOB_RADIUS,
    trackWidth - TRACK_PADDING_X - PLAYHEAD_KNOB_RADIUS,
  );

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/95 p-4 shadow-2xl shadow-black/30">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Caption timeline</div>
          <div className="text-[11px] text-slate-500">
            Click a caption to preview from there. Use the pencil to edit text or timing.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-slate-300">
            {formatTime(currentTime)} / {formatTime(safeDuration)}
          </div>

          {drafts.length > 1 &&
            drafts.map((clip) => (
              <button
                key={clip.clipIndex}
                type="button"
                onClick={() => onSelectClip(clip.clipIndex)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  selectedClipIndex === clip.clipIndex
                    ? "border-cyan-400 bg-cyan-400/15 text-cyan-200"
                    : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400/60"
                }`}
              >
                Clip {clip.clipIndex + 1}
              </button>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90"
          style={{ width: trackWidth, height: TRACK_HEIGHT }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            onSeek(xToTime(x));
          }}
        >
          {timeMarkers.map((time, index) => {
            const isFirstMarker = index === 0;
            const isLastMarker = index === timeMarkers.length - 1;
            const x = clamp(timeToX(time), TRACK_PADDING_X, trackWidth - TRACK_PADDING_X);

            return (
              <div
                key={`${time}-${index}`}
                className="absolute top-10 bottom-4 w-px bg-slate-800/80"
                style={{ left: x }}
              >
                <div
                  className={`absolute top-[-18px] text-[9px] whitespace-nowrap text-slate-600 ${
                    isFirstMarker
                      ? "left-0"
                      : isLastMarker
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  {formatTime(time)}
                </div>
              </div>
            );
          })}

          <div className="absolute top-[62px] right-8 left-8 h-1 rounded-full bg-slate-800/90" />

          <div
            className="pointer-events-none absolute top-3 bottom-4 z-30 w-px bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.95)]"
            style={{ left: playheadX }}
          >
            <div className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]" />
          </div>

          {chunks.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No caption chunks for this clip.
            </div>
          )}

          {visualChunks.map(({ chunk, index, left, width }) => {
            const isActive = currentTime >= chunk.startSec && currentTime <= chunk.endSec;

            return (
              <button
                key={chunk.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seekToChunk(chunk);
                }}
                className={`group absolute h-[76px] overflow-hidden rounded-2xl border px-3.5 py-2.5 text-left leading-snug transition ${
                  isActive
                    ? "border-emerald-300 bg-emerald-400/20 text-emerald-50 shadow-lg shadow-emerald-400/20"
                    : "border-slate-700 bg-slate-800/90 text-slate-200 hover:border-cyan-400/70 hover:bg-slate-800"
                }`}
                style={{
                  left,
                  width,
                  top: BLOCK_TOP,
                }}
                title="Click to preview from this caption"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="shrink-0 rounded-full border border-slate-700/80 bg-slate-950/70 px-2 py-0.5 text-[9px] font-bold text-slate-300">
                    #{index + 1}
                  </span>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-slate-950/60 px-2 py-0.5 text-[9px] font-medium text-slate-500">
                      {formatTime(chunk.startSec)}
                    </span>

                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit caption ${index + 1}`}
                      title="Edit caption"
                      onClick={(e) => {
                        e.stopPropagation();
                        openChunkEditor(chunk);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          openChunkEditor(chunk);
                        }
                      }}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10 text-[10px] text-cyan-200 opacity-80 transition hover:border-cyan-300 hover:bg-cyan-400/20 hover:opacity-100 focus:ring-2 focus:ring-cyan-400/30 focus:outline-none"
                    >
                      ✎
                    </span>
                  </div>
                </div>

                <div className="line-clamp-2 text-[12px] leading-snug font-semibold text-slate-100">
                  {chunk.text}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {editingChunk && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Edit caption</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatTime(editingChunk.startSec)} → {formatTime(editingChunk.endSec)}
                </div>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  Start
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingChunk.startSec}
                  onChange={(e) => updateChunkTime("startSec", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  End
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingChunk.endSec}
                  onChange={(e) => updateChunkTime("endSec", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={saveChunkText}
                className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 hover:brightness-110"
              >
                Save caption
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}