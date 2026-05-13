import type { CustomRange, LocalShortsSelectionMode } from "../home.types";
import CustomRangesEditor from "./CustomRangesEditor";

type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel" | "multi_source_edit";
  selectionMode: LocalShortsSelectionMode;
  setSelectionMode: (value: LocalShortsSelectionMode) => void;
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

export default function ShortsSelectionSection({
  jobGoal,
  selectionMode,
  setSelectionMode,
  customRanges,
  onAddClip,
  onRemoveClip,
  onAddRange,
  onRemoveRange,
  onChangeRange,
}: Props) {
  if (jobGoal !== "shorts") return null;

  return (
    <div className="mt-4 border-t border-slate-800/80 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-50">Clip selection</h2>
        <span className="text-[10px] text-slate-500">
          {selectionMode === "custom" ? "Manual periods" : "AI auto-detect"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSelectionMode("auto")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            selectionMode === "auto"
              ? "border-sky-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-sky-500/60"
          }`}
        >
          <div className="font-semibold">AI Auto</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Let AI detect the best short-form moments automatically.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectionMode("custom")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            selectionMode === "custom"
              ? "border-emerald-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-emerald-500/60"
          }`}
        >
          <div className="font-semibold">Custom periods</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Build each short from one or more exact source moments.
          </div>
        </button>
      </div>

      {selectionMode === "custom" && (
        <CustomRangesEditor
          customRanges={customRanges}
          onAddClip={onAddClip}
          onRemoveClip={onRemoveClip}
          onAddRange={onAddRange}
          onRemoveRange={onRemoveRange}
          onChangeRange={onChangeRange}
        />
      )}
    </div>
  );
}
