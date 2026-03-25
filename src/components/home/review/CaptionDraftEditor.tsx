"use client";

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
  onSelectClip: (clipIndex: number) => void;
  onSeekToChunk?: (time: number) => void;
  onChange: (next: CaptionDraftClip[]) => void;
};

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function CaptionDraftEditor({
  drafts,
  selectedClipIndex,
  onSelectClip,
  onSeekToChunk,
  onChange,
}: Props) {
  function updateChunkText(clipIndex: number, chunkId: string, value: string) {
    onChange(
      drafts.map((clip) =>
        clip.clipIndex !== clipIndex ? clip : {
          ...clip,
          chunks: clip.chunks.map((chunk) =>
            chunk.id !== chunkId ? chunk : { ...chunk, text: value }
          ),
        }
      ),
    );
  }

  const currentClip =
    drafts.find((clip) => clip.clipIndex === selectedClipIndex) ?? null;

  return (
    <div className="space-y-4">
      {drafts.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-xs text-slate-400">
          No caption drafts available.
        </div>
      )}

      {drafts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {drafts.map((clip) => (
            <button
              key={clip.clipIndex}
              type="button"
              onClick={() => onSelectClip(clip.clipIndex)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                selectedClipIndex === clip.clipIndex
                  ? "border-sky-500 bg-sky-500/15 text-sky-300"
                  : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-sky-500/60"
              }`}
            >
              Clip {clip.clipIndex + 1}
            </button>
          ))}
        </div>
      )}

      {currentClip && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">
              Clip {currentClip.clipIndex + 1}
            </div>
            <div className="text-[10px] text-slate-500">
              {currentClip.chunks.length}{" "}
              chunk{currentClip.chunks.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="space-y-3">
            {currentClip.chunks.map((chunk, idx) => (
              <div
                key={chunk.id}
                className="rounded-xl border border-slate-800/80 bg-slate-950/90 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Chunk {idx + 1}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSeekToChunk?.(chunk.startSec)}
                    className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-slate-900"
                  >
                    {formatSeconds(chunk.startSec)} →{" "}
                    {formatSeconds(chunk.endSec)}
                  </button>
                </div>

                <textarea
                  value={chunk.text}
                  onChange={(e) =>
                    updateChunkText(
                      currentClip.clipIndex,
                      chunk.id,
                      e.target.value,
                    )}
                  rows={2}
                  className="w-full resize-y rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                />

                {chunk.words?.length
                  ? (
                    <div className="mt-2 text-[10px] text-slate-500">
                      {chunk.words.map((w) => w.text).join(" • ")}
                    </div>
                  )
                  : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
