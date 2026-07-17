type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel" | "multi_source_edit";
  clipDurationSec: number;
  setClipDurationSec: (value: number) => void;
  maxClips: number;
  setMaxClips: (value: number) => void;
  generateTitles: boolean;
  setGenerateTitles: (value: boolean | ((prev: boolean) => boolean)) => void;
};

export default function ClipSettingsSection({
  jobGoal,
  clipDurationSec,
  setClipDurationSec,
  maxClips,
  setMaxClips,
  generateTitles,
  setGenerateTitles,
}: Props) {
  if (jobGoal === "quote_reel") return null;

  return (
    <div
      className={`mt-4 grid gap-4 border-t border-slate-800/80 pt-4 md:grid-cols-2 ${
        jobGoal === "summary" ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="space-y-2 md:border-r md:border-slate-800/80 md:pr-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200">Clip length</h3>
          <span className="text-[10px] text-slate-500">~{clipDurationSec}s per short</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {[20, 30, 45, 60, 90].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setClipDurationSec(val)}
              className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                clipDurationSec === val
                  ? "bg-sky-500 text-slate-950 shadow shadow-sky-500/40"
                  : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {val}s
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 md:pl-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200">Max clips per video</h3>
          <span className="text-[10px] text-slate-500">Up to {maxClips} shorts</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setMaxClips(val)}
              className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                maxClips === val
                  ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                  : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {val} clip{val > 1 ? "s" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3 md:col-span-2">
        <div>
          <div className="text-xs font-semibold text-slate-200">AI post title per short</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Generate a short catchy title for each clip (shown with the result, for your caption).
            Optional.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setGenerateTitles((prev) => !prev)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
            generateTitles
              ? "border-emerald-400 bg-emerald-500/20"
              : "border-slate-600 bg-slate-800/80"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
              generateTitles ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
