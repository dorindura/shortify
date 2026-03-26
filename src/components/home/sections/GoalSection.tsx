import type { LocalJobGoal } from "../home.types";

type Props = {
  jobGoal: LocalJobGoal;
  setJobGoal: (value: LocalJobGoal) => void;
  summaryTargetSec: number;
  setSummaryTargetSec: (value: number) => void;
  isPro: boolean;
};

export default function GoalSection({
  jobGoal,
  setJobGoal,
  summaryTargetSec,
  setSummaryTargetSec,
  isPro,
}: Props) {
  return (
    <div className="mt-4 border-t border-slate-800/80 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-50">Goal</h2>
        <span className="text-[10px] text-slate-500">
          {jobGoal === "summary"
            ? `Summary ~${summaryTargetSec}s`
            : jobGoal === "quote_reel"
              ? "Quote Reel"
              : jobGoal === "multi_source_edit"
                ? "Multi-source Edit"
                : "Multiple shorts"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setJobGoal("shorts")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            jobGoal === "shorts"
              ? "border-sky-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-sky-500/60"
          }`}
        >
          <div className="font-semibold">AI Shorts</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Generate multiple clips (maxClips) at your chosen duration.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setJobGoal("summary")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            jobGoal === "summary"
              ? "border-emerald-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-emerald-500/60"
          }`}
        >
          <div className="font-semibold">AI Story Summary (Pro)</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            One highlight reel around a target length.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setJobGoal("quote_reel")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            jobGoal === "quote_reel"
              ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
          }`}
        >
          <div className="font-semibold">Quote Reel (Pro)</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Generate a faceless reel with a famous quote, curated visuals, and AI sound suggestions.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setJobGoal("multi_source_edit")}
          className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
            jobGoal === "multi_source_edit"
              ? "border-cyan-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-cyan-500/60"
          }`}
        >
          <div className="font-semibold">Multi-Source Edit</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Manually combine segments from up to 5 source URLs into one final timeline.
          </div>
        </button>
      </div>

      <div className={`mt-4 ${jobGoal !== "summary" ? "hidden" : ""}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200">Summary length</h3>
          <span className="text-[10px] text-slate-500">Target: ~{summaryTargetSec}s</span>
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {[45, 60, 90, 120, 180].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setSummaryTargetSec(val)}
              className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                summaryTargetSec === val
                  ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                  : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {val}s
            </button>
          ))}
        </div>

        <input
          type="range"
          min={30}
          max={300}
          step={5}
          value={summaryTargetSec}
          onChange={(e) => setSummaryTargetSec(Number(e.target.value))}
          className="mt-3 w-full accent-emerald-400"
        />

        {!isPro && summaryTargetSec > 60 && (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            Free plan allows summary up to 60s. Choose 60s or upgrade to Pro.
          </div>
        )}
      </div>
    </div>
  );
}
