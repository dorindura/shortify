import type {
  LocalQuoteCaptionPreset,
  LocalQuoteReelMode,
  LocalQuoteTone,
  LocalQuoteVisualSource,
  LocalQuoteVoicePreset,
} from "../home.types";

type Props = {
  jobGoal: "shorts" | "summary" | "quote_reel" | "multi_source_edit";
  quoteMode: LocalQuoteReelMode;
  setQuoteMode: (value: LocalQuoteReelMode) => void;
  quotePrompt: string;
  setQuotePrompt: (value: string) => void;
  quoteText: string;
  setQuoteText: (value: string) => void;
  quoteTone: LocalQuoteTone;
  setQuoteTone: (value: LocalQuoteTone) => void;
  quoteVisualSource: LocalQuoteVisualSource;
  setQuoteVisualSource: (value: LocalQuoteVisualSource) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  voicePreset: LocalQuoteVoicePreset;
  setVoicePreset: (value: LocalQuoteVoicePreset) => void;
  targetDurationSec: number;
  setTargetDurationSec: (value: number) => void;
  minDurationSec: number;
  setMinDurationSec: (value: number) => void;
  maxDurationSec: number;
  setMaxDurationSec: (value: number) => void;
  captionsEnabled: boolean;
  setCaptionsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  quoteCaptionPreset: LocalQuoteCaptionPreset;
  setQuoteCaptionPreset: (value: LocalQuoteCaptionPreset) => void;
  loading: boolean;
  onCreateQuoteReel: () => Promise<void>;
};

export default function QuoteReelSection({
  jobGoal,
  quoteMode,
  setQuoteMode,
  quotePrompt,
  setQuotePrompt,
  quoteText,
  setQuoteText,
  quoteTone,
  setQuoteTone,
  quoteVisualSource,
  setQuoteVisualSource,
  voiceEnabled,
  setVoiceEnabled,
  voicePreset,
  setVoicePreset,
  targetDurationSec,
  setTargetDurationSec,
  minDurationSec,
  setMinDurationSec,
  maxDurationSec,
  setMaxDurationSec,
  captionsEnabled,
  setCaptionsEnabled,
  quoteCaptionPreset,
  setQuoteCaptionPreset,
  loading,
  onCreateQuoteReel,
}: Props) {
  if (jobGoal !== "quote_reel") return null;

  const canSubmit = quoteMode === "manual_text" ? !!quoteText.trim() : !!quotePrompt.trim();

  return (
    <div className="mt-4 rounded-xl border border-fuchsia-500/20 bg-slate-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">AI Story Reel settings</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            60s+ vertical faceless reel with fast scene changes, ElevenLabs voice-over, and quote
            reel specific captions.
          </div>
        </div>

        <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-[10px] font-semibold text-fuchsia-200 ring-1 ring-fuchsia-500/20">
          Pro
        </span>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Input mode</label>
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setQuoteMode("manual_text")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteMode === "manual_text"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Manual text</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Paste your own long-form text and turn it into a story reel.
            </div>
          </button>

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
              Give a niche or idea and let AI generate the full 60s+ script.
            </div>
          </button>
        </div>
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
            <option value="emotional">Emotional</option>
            <option value="stoic">Stoic</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-300">Voice preset</label>
          <select
            value={voicePreset}
            onChange={(e) => setVoicePreset(e.target.value as LocalQuoteVoicePreset)}
            disabled={!voiceEnabled}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 disabled:opacity-50"
          >
            <option value="storyteller">English grandpa</option>
            <option value="dark_male">Dark male</option>
            <option value="motivational_male">Motivational male</option>
            <option value="soft_female">Soft female</option>
            <option value="neutral">Romanian grandpa</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Visual source</label>
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setQuoteVisualSource("auto")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteVisualSource === "auto"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Smart cinematic</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Match each segment with emotional video assets.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setQuoteVisualSource("cartoons")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteVisualSource === "cartoons"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Cartoons</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Random clips from the cartoons asset folder.
            </div>
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-[11px] font-medium text-slate-300">Target duration</label>
          <input
            type="number"
            min={45}
            max={180}
            value={targetDurationSec}
            onChange={(e) => setTargetDurationSec(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-300">Min duration</label>
          <input
            type="number"
            min={45}
            max={180}
            value={minDurationSec}
            onChange={(e) => setMinDurationSec(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-300">Max duration</label>
          <input
            type="number"
            min={50}
            max={240}
            value={maxDurationSec}
            onChange={(e) => setMaxDurationSec(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-slate-200">Captions</div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              Choose one quote reel caption behavior.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCaptionsEnabled((prev) => !prev)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
              captionsEnabled
                ? "border-emerald-400 bg-emerald-500/20"
                : "border-slate-600 bg-slate-800/80"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
                captionsEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className={`mt-3 grid gap-2 md:grid-cols-3 ${!captionsEnabled ? "opacity-50" : ""}`}>
          <button
            type="button"
            disabled={!captionsEnabled}
            onClick={() => setQuoteCaptionPreset("card_bottom_premium_karaoke")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteCaptionPreset === "card_bottom_premium_karaoke"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Premium bottom</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Clean lower captions tuned for the cinematic video card.
            </div>
          </button>

          <button
            type="button"
            disabled={!captionsEnabled}
            onClick={() => setQuoteCaptionPreset("card_center_word_by_word")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteCaptionPreset === "card_center_word_by_word"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Center word-by-word</div>
            <div className="mt-1 text-[11px] text-slate-400">
              One word at a time in the center of the reel.
            </div>
          </button>

          <button
            type="button"
            disabled={!captionsEnabled}
            onClick={() => setQuoteCaptionPreset("card_center_progressive_words")}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              quoteCaptionPreset === "card_center_progressive_words"
                ? "border-fuchsia-500 bg-slate-900/80 text-slate-50"
                : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-fuchsia-500/60"
            }`}
          >
            <div className="font-semibold">Center progressive words</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Words displayed progressively in the center of the reel.
            </div>
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
        <div>
          <div className="text-[11px] font-medium text-slate-200">Voice-over</div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            ElevenLabs narration synced with captions.
          </div>
        </div>

        <button
          type="button"
          onClick={() => setVoiceEnabled((prev) => !prev)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
            voiceEnabled
              ? "border-emerald-400 bg-emerald-500/20"
              : "border-slate-600 bg-slate-800/80"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
              voiceEnabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <button
        type="button"
        onClick={onCreateQuoteReel}
        disabled={loading || !canSubmit}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow shadow-fuchsia-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Generating..." : "Generate AI Story Reel"}
      </button>
    </div>
  );
}
