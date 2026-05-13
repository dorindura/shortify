import type { CustomRange } from "../home.types";

type Props = {
  customRanges: CustomRange[];
  onAddClip: () => void;
  onRemoveClip: (clipId: string) => void;
  onAddRange: (clipId: string) => void;
  onRemoveRange: (clipId: string, rangeId: string) => void;
  onChangeRange: (
    clipId: string,
    rangeId: string,
    field: "startSec" | "endSec",
    value: string,
  ) => void;
};

export default function CustomRangesEditor({
  customRanges,
  onAddClip,
  onRemoveClip,
  onAddRange,
  onRemoveRange,
  onChangeRange,
}: Props) {
  return (
    <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-200">Custom clip periods</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Add exact time ranges using mm:ss or seconds. Example: 12:45 → 13:22
          </div>
        </div>

        <button
          type="button"
          onClick={onAddClip}
          className="rounded-full border border-emerald-500/60 px-3 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
        >
          + Add clip
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {customRanges.map((clip, index) => (
          <div key={clip.id} className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-200">Clip {index + 1}</div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAddRange(clip.id)}
                  className="rounded-full border border-emerald-500/60 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
                >
                  + Add range
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveClip(clip.id)}
                  className="rounded-full border border-rose-500/60 px-2.5 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                >
                  Remove clip
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {clip.ranges.map((range, rangeIndex) => (
                <div
                  key={range.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold text-slate-300">
                      Range {rangeIndex + 1}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveRange(clip.id, range.id)}
                      className="rounded-full border border-rose-500/50 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Remove range
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-400">
                        Start (mm:ss)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={range.startSec}
                        onChange={(e) =>
                          onChangeRange(clip.id, range.id, "startSec", e.target.value)
                        }
                        placeholder="12:45"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-slate-400">End (mm:ss)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={range.endSec}
                        onChange={(e) => onChangeRange(clip.id, range.id, "endSec", e.target.value)}
                        placeholder="13:22"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-[10px] text-slate-500">
              Ranges inside this clip are stitched together in order.
              <br />
              Accepted formats: <span className="text-slate-300">mm:ss</span> or{" "}
              <span className="text-slate-300">seconds</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
        In custom mode, invalid ranges will fail the job instead of falling back to AI.
      </div>
    </div>
  );
}
