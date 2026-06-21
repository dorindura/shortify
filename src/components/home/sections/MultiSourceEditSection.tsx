"use client";

import type { MultiSourceInput, MultiSourceSegmentDraft } from "../home.types";

type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel" | "multi_source_edit";
  sources: MultiSourceInput[];
  segments: MultiSourceSegmentDraft[];
  onAddSource: () => void;
  onRemoveSource: (id: string) => void;
  onChangeSourceUrl: (id: string, value: string) => void;
  onAddSegment: (sourceId: string) => void;
  onRemoveSegment: (id: string) => void;
  onChangeSegment: (id: string, field: "startSec" | "endSec", value: string) => void;
};

export default function MultiSourceEditSection({
  jobGoal,
  sources,
  segments,
  onAddSource,
  onRemoveSource,
  onChangeSourceUrl,
  onAddSegment,
  onRemoveSegment,
  onChangeSegment,
}: Props) {
  if (jobGoal !== "multi_source_edit") return null;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Multi-source edit</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Add up to 5 video URLs and define the exact segments you want to concatenate.
          </div>
        </div>

        <button
          type="button"
          onClick={onAddSource}
          disabled={sources.length >= 5}
          className="rounded-xl border border-sky-500/60 px-3 py-2 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add source
        </button>
      </div>

      <div className="space-y-4">
        {sources.map((source, sourceIndex) => {
          const sourceSegments = segments
            .filter((segment) => segment.sourceId === source.id)
            .sort((a, b) => a.order - b.order);

          return (
            <div
              key={source.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-200">Source {sourceIndex + 1}</div>

                <button
                  type="button"
                  onClick={() => onRemoveSource(source.id)}
                  className="rounded-lg border border-rose-500/50 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                >
                  Remove source
                </button>
              </div>

              <input
                type="url"
                value={source.url}
                onChange={(e) => onChangeSourceUrl(source.id, e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  Add one or more manual time ranges from this source.
                </div>

                <button
                  type="button"
                  onClick={() => onAddSegment(source.id)}
                  className="rounded-lg border border-emerald-500/60 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
                >
                  Add segment
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {sourceSegments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 px-3 py-3 text-[11px] text-slate-500">
                    No segments added for this source yet.
                  </div>
                ) : (
                  sourceSegments.map((segment, idx) => (
                    <div
                      key={segment.id}
                      className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 md:grid-cols-[1fr_1fr_auto]"
                    >
                      <div>
                        <label className="text-[10px] font-medium text-slate-400">Start time</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={segment.startSec}
                          onChange={(e) => onChangeSegment(segment.id, "startSec", e.target.value)}
                          placeholder="1:20 or 80"
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-medium text-slate-400">End time</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={segment.endSec}
                          onChange={(e) => onChangeSegment(segment.id, "endSec", e.target.value)}
                          placeholder="2:05 or 125"
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => onRemoveSegment(segment.id)}
                          className="w-full rounded-xl border border-rose-500/50 px-3 py-2 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-500 md:col-span-3">
                        Segment #{idx + 1} from this source
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
