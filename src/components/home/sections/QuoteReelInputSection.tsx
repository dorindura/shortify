import type { LocalQuoteAngle, LocalQuoteReelMode } from "../home.types";

type Props = {
  quoteMode: LocalQuoteReelMode;
  setQuoteMode: (value: LocalQuoteReelMode) => void;
  quotePrompt: string;
  setQuotePrompt: (value: string) => void;
  quoteText: string;
  setQuoteText: (value: string) => void;
  autoAngle: boolean;
  setAutoAngle: (value: boolean | ((prev: boolean) => boolean)) => void;
  batchCount: number;
  setBatchCount: (value: number) => void;
  anglesLoading: boolean;
  angleCandidates: LocalQuoteAngle[];
  selectedAngleIdx: number[];
  onPreviewAngles: () => Promise<void>;
  onToggleAngle: (index: number) => void;
  loading: boolean;
};

export default function QuoteReelInputSection({
  quoteMode,
  setQuoteMode,
  quotePrompt,
  setQuotePrompt,
  quoteText,
  setQuoteText,
  autoAngle,
  setAutoAngle,
  batchCount,
  setBatchCount,
  anglesLoading,
  angleCandidates,
  selectedAngleIdx,
  onPreviewAngles,
  onToggleAngle,
  loading,
}: Props) {
  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setQuoteMode("ai_text")}
          className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
            quoteMode === "ai_text"
              ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
          }`}
        >
          <div className="font-semibold">AI topic prompt</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Give a niche or idea and let AI write the full 60s+ script.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setQuoteMode("manual_text")}
          className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
            quoteMode === "manual_text"
              ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
              : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
          }`}
        >
          <div className="font-semibold">Paste my own text</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Turn your own long-form text into a story reel.
          </div>
        </button>
      </div>

      {quoteMode === "manual_text" ? (
        <div className="mt-4">
          <label className="text-[11px] font-medium text-slate-300">Your text*</label>
          <textarea
            value={quoteText}
            onChange={(e) => setQuoteText(e.target.value)}
            rows={10}
            placeholder="Paste a long emotional / reflective / motivational text here..."
            className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          />
          <div className="mt-1 text-[10px] text-slate-500">
            Best results usually come from longer texts that can sustain 60s+ narration.
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <label className="text-[11px] font-medium text-slate-300">Topic / niche prompt*</label>
          <textarea
            value={quotePrompt}
            onChange={(e) => setQuotePrompt(e.target.value)}
            rows={4}
            placeholder="forgiveness after betrayal, masculine self-respect, discipline over emotions, healing from pain..."
            className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          />
        </div>
      )}

      {quoteMode === "ai_text" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
          <div>
            <div className="text-[11px] font-medium text-slate-200">Auto-angle (variety)</div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              Treat the prompt as a niche and let AI pick a fresh, distinct angle each time — so a
              batch of reels stays varied but on-brand. Off = use your prompt as-is.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAutoAngle((prev) => !prev)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
              autoAngle
                ? "border-emerald-400 bg-emerald-500/20"
                : "border-slate-600 bg-slate-800/80"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
                autoAngle ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {quoteMode === "ai_text" && autoAngle && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-slate-950/60 px-3 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300">How many angles</label>
              <input
                type="number"
                min={3}
                max={6}
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="mt-1 w-20 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              type="button"
              onClick={onPreviewAngles}
              disabled={anglesLoading || loading || !quotePrompt.trim()}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {anglesLoading ? "Thinking..." : "Preview angles"}
            </button>
            <div className="w-full text-[10px] text-slate-500">
              Generate distinct angle ideas from this niche, then pick the ones worth turning into
              reels. Each selected angle becomes one job when you generate.
            </div>
          </div>

          {angleCandidates.length > 0 && (
            <div className="mt-3 space-y-2">
              {angleCandidates.map((angle, index) => {
                const selected = selectedAngleIdx.includes(index);
                return (
                  <button
                    key={`${angle.angleFormat}-${index}`}
                    type="button"
                    onClick={() => onToggleAngle(index)}
                    className={`block w-full rounded-lg border px-3 py-2 text-left transition ${
                      selected
                        ? "border-emerald-400 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/70 hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-emerald-200">
                        {angle.angleFormat} · {angle.theme} · {angle.register}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          selected ? "text-emerald-300" : "text-slate-600"
                        }`}
                      >
                        {selected ? "✓ selected" : "tap to select"}
                      </span>
                    </div>
                    {angle.workingTitle && (
                      <div className="mt-1 text-[11px] font-semibold text-slate-100">
                        {angle.workingTitle}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-slate-300 italic">“{angle.hook}”</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{angle.premise}</div>
                  </button>
                );
              })}

              <div className="text-[10px] text-emerald-300/80">
                {selectedAngleIdx.length} selected — use{" "}
                <span className="font-semibold">Generate</span> to create{" "}
                {selectedAngleIdx.length === 1 ? "it" : "them"}.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
