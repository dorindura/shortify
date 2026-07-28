import type { LocalJobGoal } from "../home.types";

type Props = {
  jobGoal: LocalJobGoal;
  setJobGoal: (value: LocalJobGoal) => void;
  summaryTargetSec: number;
  setSummaryTargetSec: (value: number) => void;
  isPro: boolean;
};

const GOAL_CARDS: {
  goal: LocalJobGoal;
  icon: string;
  title: string;
  desc: string;
  tag: string;
  activeClass: string;
  hoverClass: string;
}[] = [
  {
    goal: "shorts",
    icon: "✂️",
    title: "AI Shorts",
    desc: "Auto-detect the best moments from one video and cut multiple clips.",
    tag: "From a video",
    activeClass: "border-sky-500 bg-sky-500/10 text-slate-50",
    hoverClass: "hover:border-sky-500/60",
  },
  {
    goal: "quote_reel",
    icon: "🎙️",
    title: "Story Reel",
    desc: "Faceless vertical reel from a prompt or your text — voice, captions, scenes.",
    tag: "Pro · From text",
    activeClass: "border-fuchsia-500 bg-fuchsia-500/10 text-slate-50",
    hoverClass: "hover:border-fuchsia-500/60",
  },
  {
    goal: "multi_source_edit",
    icon: "🎬",
    title: "Multi-Source",
    desc: "Stitch exact segments from up to 5 videos into one final timeline.",
    tag: "Manual edit",
    activeClass: "border-cyan-500 bg-cyan-500/10 text-slate-50",
    hoverClass: "hover:border-cyan-500/60",
  },
];

export default function GoalSection({
  jobGoal,
  setJobGoal,
  summaryTargetSec,
  setSummaryTargetSec,
  isPro,
}: Props) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {GOAL_CARDS.map((card) => {
          const active = jobGoal === card.goal;
          return (
            <button
              key={card.goal}
              type="button"
              onClick={() => setJobGoal(card.goal)}
              className={`rounded-xl border px-3 py-3 text-left text-xs transition hover:-translate-y-0.5 ${
                active
                  ? card.activeClass
                  : `border-slate-800 bg-slate-950/70 text-slate-300 ${card.hoverClass}`
              }`}
            >
              <div className="text-lg leading-none">{card.icon}</div>
              <div className="mt-2 text-sm font-semibold">{card.title}</div>
              <div className="mt-1 text-[11px] text-slate-400">{card.desc}</div>
              <span
                className={`mt-2.5 inline-block rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase ${
                  active ? "border-slate-600 text-slate-200" : "border-slate-800 text-slate-500"
                }`}
              >
                {card.tag}
              </span>
            </button>
          );
        })}
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
