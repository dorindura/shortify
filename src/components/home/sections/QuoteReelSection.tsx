import type { LocalQuoteTone } from "../home.types";

type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel";
  quotePrompt: string;
  setQuotePrompt: (value: string) => void;
  quoteTone: LocalQuoteTone;
  setQuoteTone: (value: LocalQuoteTone) => void;
  loading: boolean;
  onCreateQuoteReel: () => Promise<void>;
};

export default function QuoteReelSection({
  jobGoal,
  quotePrompt,
  setQuotePrompt,
  quoteTone,
  setQuoteTone,
  loading,
  onCreateQuoteReel,
}: Props) {
  if (jobGoal !== "quote_reel") return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">Quote Reel settings</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Premium image packs + famous quote + caption + sound suggestion
          </div>
        </div>

        <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-[10px] font-semibold text-fuchsia-200 ring-1 ring-fuchsia-500/20">
          Pro
        </span>
      </div>

      <div className="mt-4">
        <label className="text-[11px] font-medium text-slate-300">Theme / keywords*</label>
        <textarea
          value={quotePrompt}
          onChange={(e) => setQuotePrompt(e.target.value)}
          rows={4}
          placeholder="discipline, pain, self-control, ambition, success, God..."
          className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-medium text-slate-300">Tone</label>
          <select
            value={quoteTone}
            onChange={(e) => setQuoteTone(e.target.value as LocalQuoteTone)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          >
            <option value="cinematic">Cinematic</option>
            <option value="aggressive">Aggressive</option>
            <option value="calm">Calm</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={onCreateQuoteReel}
        disabled={loading || !quotePrompt.trim()}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow shadow-fuchsia-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Generating..." : "Generate Quote Reel"}
      </button>
    </div>
  );
}