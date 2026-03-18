import type {
  CustomRange,
  LocalCaptionStyle,
  LocalJobAspect,
  LocalJobGoal,
  LocalQuoteTone,
  LocalShortsSelectionMode,
} from "./home.types";
import OutputFormatSection from "./sections/OutputFormatSection";
import GoalSection from "./sections/GoalSection";
import ShortsSelectionSection from "./sections/ShortsSelectionSection";
import ClipSettingsSection from "./sections/ClipSettingsSection";
import QuoteReelSection from "./sections/QuoteReelSection";
import CaptionsSection from "./sections/CaptionsSection";

type Props = {
  loading: boolean;
  url: string;
  setUrl: (value: string) => void;
  paywallMessage: string | null;
  showUpgrade: boolean;
  startCheckout: () => Promise<void>;
  handleUrlSubmit: (e: React.FormEvent) => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isQuoteReel: boolean;
  aspect: LocalJobAspect;
  setAspect: (value: LocalJobAspect) => void;
  optimizedLabel: string;
  jobGoal: LocalJobGoal;
  setJobGoal: (value: LocalJobGoal) => void;
  summaryTargetSec: number;
  setSummaryTargetSec: (value: number) => void;
  isPro: boolean;
  selectionMode: LocalShortsSelectionMode;
  setSelectionMode: (value: LocalShortsSelectionMode) => void;
  customRanges: CustomRange[];
  onAddRange: () => void;
  onRemoveRange: (id: string) => void;
  onChangeRange: (id: string, field: "startSec" | "endSec", value: string) => void;
  validCustomRangesCount: number;
  clipDurationSec: number;
  setClipDurationSec: (value: number) => void;
  maxClips: number;
  setMaxClips: (value: number) => void;
  quotePrompt: string;
  setQuotePrompt: (value: string) => void;
  quoteTone: LocalQuoteTone;
  setQuoteTone: (value: LocalQuoteTone) => void;
  createQuoteReelJob: () => Promise<void>;
  captionsEnabled: boolean;
  setCaptionsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  captionStyle: LocalCaptionStyle;
  setCaptionStyle: (value: LocalCaptionStyle) => void;
};

export default function CreateJobPanel(props: Props) {
  const {
    loading,
    url,
    setUrl,
    paywallMessage,
    showUpgrade,
    startCheckout,
    handleUrlSubmit,
    handleFileChange,
    isQuoteReel,
    aspect,
    setAspect,
    optimizedLabel,
    jobGoal,
    setJobGoal,
    summaryTargetSec,
    setSummaryTargetSec,
    isPro,
    selectionMode,
    setSelectionMode,
    customRanges,
    onAddRange,
    onRemoveRange,
    onChangeRange,
    validCustomRangesCount,
    clipDurationSec,
    setClipDurationSec,
    maxClips,
    setMaxClips,
    quotePrompt,
    setQuotePrompt,
    quoteTone,
    setQuoteTone,
    createQuoteReelJob,
    captionsEnabled,
    setCaptionsEnabled,
    captionStyle,
    setCaptionStyle,
  } = props;

  return (
    <>
      <section className="space-y-5 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-50">Create new job</h2>
          <p className="text-xs text-slate-400">
            Create shorts from a URL, upload a video, or generate a Quote Reel from AI.
          </p>
        </div>

        {paywallMessage && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Limit reached</div>
                <div className="mt-0.5 text-amber-200/90">{paywallMessage}</div>
              </div>

              {showUpgrade && (
                <button
                  type="button"
                  onClick={startCheckout}
                  className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow hover:brightness-110"
                >
                  Upgrade
                </button>
              )}
            </div>
          </div>
        )}

        {isQuoteReel && (
          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3 text-[12px] text-fuchsia-200">
            Quote Reel is prompt-based — URL and upload are disabled in this mode.
          </div>
        )}

        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="url"
              placeholder="youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading || isQuoteReel}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/90 px-10 py-2 text-sm text-slate-100 ring-1 ring-transparent transition outline-none focus:border-sky-500 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={
              loading || isQuoteReel || (selectionMode === "custom" && validCustomRangesCount === 0)
            }
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="hidden sm:inline">Generate from URL</span>
            <span className="sm:hidden">Generate</span>
          </button>
        </form>

        <div className="flex items-center gap-3 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
          <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
          or upload file
          <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
        </div>

        <label
          className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center text-xs transition ${
            isQuoteReel
              ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-500"
              : "cursor-pointer border-slate-700/90 bg-slate-900/60 text-slate-300/90 hover:border-sky-500 hover:bg-slate-900/80"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-sky-300">
              Upload video
            </span>
            <span className="text-slate-400">MP4 / MOV / WebM</span>
          </div>
          <p className="max-w-xs text-[11px] text-slate-500">
            Drop a file here or click to browse from your computer.
          </p>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            disabled={
              loading || isQuoteReel || (selectionMode === "custom" && validCustomRangesCount === 0)
            }
            className={`absolute inset-0 opacity-0 ${
              isQuoteReel ? "cursor-not-allowed" : "cursor-pointer"
            }`}
          />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
        <OutputFormatSection
          aspect={aspect}
          setAspect={setAspect}
          isQuoteReel={isQuoteReel}
          optimizedLabel={optimizedLabel}
        />

        <GoalSection
          jobGoal={jobGoal}
          setJobGoal={setJobGoal}
          summaryTargetSec={summaryTargetSec}
          setSummaryTargetSec={setSummaryTargetSec}
          isPro={isPro}
        />

        <ShortsSelectionSection
          jobGoal={jobGoal}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          customRanges={customRanges}
          onAddRange={onAddRange}
          onRemoveRange={onRemoveRange}
          onChangeRange={onChangeRange}
        />

        <ClipSettingsSection
          jobGoal={jobGoal}
          clipDurationSec={clipDurationSec}
          setClipDurationSec={setClipDurationSec}
          maxClips={maxClips}
          setMaxClips={setMaxClips}
        />

        <QuoteReelSection
          jobGoal={jobGoal}
          quotePrompt={quotePrompt}
          setQuotePrompt={setQuotePrompt}
          quoteTone={quoteTone}
          setQuoteTone={setQuoteTone}
          loading={loading}
          onCreateQuoteReel={createQuoteReelJob}
        />

        <CaptionsSection
          captionsEnabled={captionsEnabled}
          setCaptionsEnabled={setCaptionsEnabled}
          captionStyle={captionStyle}
          setCaptionStyle={setCaptionStyle}
        />
      </section>
    </>
  );
}
