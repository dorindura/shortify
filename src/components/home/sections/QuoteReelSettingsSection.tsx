import type {
  LocalQuoteCaptionPreset,
  LocalQuoteTone,
  LocalQuoteVisualSource,
  LocalQuoteVoicePreset,
} from "../home.types";

type Props = {
  quoteTone: LocalQuoteTone;
  setQuoteTone: (value: LocalQuoteTone) => void;
  quoteVisualSource: LocalQuoteVisualSource;
  setQuoteVisualSource: (value: LocalQuoteVisualSource) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  voicePreset: LocalQuoteVoicePreset;
  setVoicePreset: (value: LocalQuoteVoicePreset) => void;
  posterEnabled: boolean;
  setPosterEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  captionsEnabled: boolean;
  setCaptionsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  quoteCaptionPreset: LocalQuoteCaptionPreset;
  setQuoteCaptionPreset: (value: LocalQuoteCaptionPreset) => void;
  targetDurationSec: number;
  setTargetDurationSec: (value: number) => void;
  minDurationSec: number;
  setMinDurationSec: (value: number) => void;
  maxDurationSec: number;
  setMaxDurationSec: (value: number) => void;
};

export default function QuoteReelSettingsSection({
  quoteTone,
  setQuoteTone,
  quoteVisualSource,
  setQuoteVisualSource,
  voiceEnabled,
  setVoiceEnabled,
  voicePreset,
  setVoicePreset,
  posterEnabled,
  setPosterEnabled,
  captionsEnabled,
  setCaptionsEnabled,
  quoteCaptionPreset,
  setQuoteCaptionPreset,
  targetDurationSec,
  setTargetDurationSec,
  minDurationSec,
  setMinDurationSec,
  maxDurationSec,
  setMaxDurationSec,
}: Props) {
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
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

      <details className="group mt-4 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/60">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-[11px] font-medium text-slate-300 [&::-webkit-details-marker]:hidden">
          Advanced
          <span className="ml-auto text-slate-500 transition group-open:rotate-90">›</span>
        </summary>

        <div className="space-y-3 px-3 pb-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Duration (seconds)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-slate-500">Target</span>
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
                <span className="text-[10px] text-slate-500">Min</span>
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
                <span className="text-[10px] text-slate-500">Max</span>
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
            <div>
              <div className="text-[11px] font-medium text-slate-200">TikTok quote poster</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Also generate a vertical poster image: an AI quote on a tone-matched photo, ready to
                post as a TikTok story.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPosterEnabled((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
                posterEnabled
                  ? "border-emerald-400 bg-emerald-500/20"
                  : "border-slate-600 bg-slate-800/80"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
                  posterEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
