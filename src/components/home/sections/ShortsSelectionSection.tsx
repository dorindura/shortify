import type { CustomRange, LocalShortsSelectionMode } from "../home.types";
import CustomRangesEditor from "./CustomRangesEditor";

type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel";
  selectionMode: LocalShortsSelectionMode;
  setSelectionMode: (value: LocalShortsSelectionMode) => void;
  customRanges: CustomRange[];
  onAddRange: () => void;
  onRemoveRange: (id: string) => void;
  onChangeRange: (id: string, field: "startSec" | "endSec", value: string) => void;
};

export default function ShortsSelectionSection({
  jobGoal,
  selectionMode,
  setSelectionMode,
  customRanges,
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
            Choose exact start and end moments for each short.
          </div>
        </button>
      </div>

      {selectionMode === "custom" && (
        <CustomRangesEditor
          customRanges={customRanges}
          onAdd={onAddRange}
          onRemove={onRemoveRange}
          onChange={onChangeRange}
        />
      )}
    </div>
  );
}
