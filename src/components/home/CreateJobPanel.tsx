import type {
  CustomRange,
  LocalCaptionStyle,
  LocalJobAspect,
  LocalJobGoal,
  LocalQuoteAngle,
  LocalQuoteCaptionPreset,
  LocalQuoteReelMode,
  LocalQuoteTone,
  LocalQuoteVisualSource,
  LocalQuoteVoicePreset,
  LocalShortsOutputMode,
  LocalShortsSelectionMode,
  MultiSourceInput,
  MultiSourceSegmentDraft,
} from "./home.types";
import OutputFormatSection from "./sections/OutputFormatSection";
import GoalSection from "./sections/GoalSection";
import ShortsSelectionSection from "./sections/ShortsSelectionSection";
import ClipSettingsSection from "./sections/ClipSettingsSection";
import CaptionsSection from "./sections/CaptionsSection";
import MultiSourceEditSection from "./sections/MultiSourceEditSection";
import QuoteReelInputSection from "./sections/QuoteReelInputSection";
import QuoteReelSettingsSection from "./sections/QuoteReelSettingsSection";

type Props = {
  loading: boolean;
  isPro: boolean;

  jobGoal: LocalJobGoal;
  setJobGoal: (value: LocalJobGoal) => void;
  summaryTargetSec: number;
  setSummaryTargetSec: (value: number) => void;

  // Shorts / summary source
  url: string;
  setUrl: (value: string) => void;
  onEnterSubmit: (e: React.FormEvent) => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  selectedUploadFileName: string | null;
  uploadInputResetKey: number;
  clearSelectedUploadFile: () => void;

  // Story reel source
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

  // Multi-source source
  multiSourceInputs: MultiSourceInput[];
  multiSourceSegments: MultiSourceSegmentDraft[];
  onAddMultiSourceInput: () => void;
  onRemoveMultiSourceInput: (id: string) => void;
  onChangeMultiSourceUrl: (id: string, value: string) => void;
  onAddMultiSourceSegment: (sourceId: string) => void;
  onRemoveMultiSourceSegment: (id: string) => void;
  onChangeMultiSourceSegment: (id: string, field: "startSec" | "endSec", value: string) => void;

  // Shorts / multi format
  aspect: LocalJobAspect;
  setAspect: (value: LocalJobAspect) => void;
  shortsOutputMode: LocalShortsOutputMode;
  setShortsOutputMode: (value: LocalShortsOutputMode) => void;
  showLocalOutputModes: boolean;
  optimizedLabel: string;
  selectionMode: LocalShortsSelectionMode;
  setSelectionMode: (value: LocalShortsSelectionMode) => void;
  customRanges: CustomRange[];
  onAddCustomClip: () => void;
  onRemoveCustomClip: (clipId: string) => void;
  onAddCustomRange: (clipId: string) => void;
  onRemoveCustomRange: (clipId: string, rangeId: string) => void;
  onChangeCustomRange: (
    clipId: string,
    rangeId: string,
    field: "startSec" | "endSec",
    value: string,
  ) => void;
  clipDurationSec: number;
  setClipDurationSec: (value: number) => void;
  maxClips: number;
  setMaxClips: (value: number) => void;
  generateTitles: boolean;
  setGenerateTitles: (value: boolean | ((prev: boolean) => boolean)) => void;
  captionsEnabled: boolean;
  setCaptionsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  captionStyle: LocalCaptionStyle;
  setCaptionStyle: (value: LocalCaptionStyle) => void;

  // Story reel format
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
  quoteCaptionPreset: LocalQuoteCaptionPreset;
  setQuoteCaptionPreset: (value: LocalQuoteCaptionPreset) => void;
  targetDurationSec: number;
  setTargetDurationSec: (value: number) => void;
  minDurationSec: number;
  setMinDurationSec: (value: number) => void;
  maxDurationSec: number;
  setMaxDurationSec: (value: number) => void;
};

const ACCENT: Record<LocalJobGoal, string> = {
  shorts: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  quote_reel: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  multi_source_edit: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  summary: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

function Step({
  num,
  title,
  hint,
  accent,
  children,
}: {
  num: number;
  title: string;
  hint?: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2.5">
        <span
          className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg border text-[12px] font-bold tabular-nums ${accent}`}
        >
          {num}
        </span>
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        {hint && <span className="ml-auto text-[11px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function CreateJobPanel(props: Props) {
  const {
    loading,
    isPro,
    jobGoal,
    setJobGoal,
    summaryTargetSec,
    setSummaryTargetSec,
    url,
    setUrl,
    onEnterSubmit,
    handleFileChange,
    selectedUploadFileName,
    uploadInputResetKey,
    clearSelectedUploadFile,
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
    multiSourceInputs,
    multiSourceSegments,
    onAddMultiSourceInput,
    onRemoveMultiSourceInput,
    onChangeMultiSourceUrl,
    onAddMultiSourceSegment,
    onRemoveMultiSourceSegment,
    onChangeMultiSourceSegment,
    aspect,
    setAspect,
    shortsOutputMode,
    setShortsOutputMode,
    showLocalOutputModes,
    optimizedLabel,
    selectionMode,
    setSelectionMode,
    customRanges,
    onAddCustomClip,
    onRemoveCustomClip,
    onAddCustomRange,
    onRemoveCustomRange,
    onChangeCustomRange,
    clipDurationSec,
    setClipDurationSec,
    maxClips,
    setMaxClips,
    generateTitles,
    setGenerateTitles,
    captionsEnabled,
    setCaptionsEnabled,
    captionStyle,
    setCaptionStyle,
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
    quoteCaptionPreset,
    setQuoteCaptionPreset,
    targetDurationSec,
    setTargetDurationSec,
    minDurationSec,
    setMinDurationSec,
    maxDurationSec,
    setMaxDurationSec,
  } = props;

  const isQuoteReel = jobGoal === "quote_reel";
  const isMultiSourceEdit = jobGoal === "multi_source_edit";
  const isShorts = jobGoal === "shorts" || jobGoal === "summary";
  const accent = ACCENT[jobGoal];

  const step2Title = isQuoteReel
    ? "Your idea or text"
    : isMultiSourceEdit
      ? "Add your sources"
      : "Add your video";
  const step2Hint = isQuoteReel
    ? "Prompt or paste"
    : isMultiSourceEdit
      ? "Up to 5 videos"
      : "YouTube URL or upload";
  const step3Hint = isQuoteReel
    ? "tone · voice · captions"
    : isMultiSourceEdit
      ? "aspect · timeline"
      : "aspect · length · captions";

  return (
    <section className="space-y-7 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-50">Create new job</h2>
        <p className="text-xs text-slate-400">
          Pick what you&apos;re making, add a source, tune the look — then generate.
        </p>
      </div>

      {/* STEP 1 — GOAL */}
      <Step num={1} title="What are you making?" accent={accent}>
        <GoalSection
          jobGoal={jobGoal}
          setJobGoal={setJobGoal}
          summaryTargetSec={summaryTargetSec}
          setSummaryTargetSec={setSummaryTargetSec}
          isPro={isPro}
        />
      </Step>

      {/* STEP 2 — SOURCE */}
      <Step num={2} title={step2Title} hint={step2Hint} accent={accent}>
        {isShorts && (
          <div>
            <form onSubmit={onEnterSubmit}>
              <input
                type="url"
                placeholder="youtube.com/watch?v=…  ·  or paste any video link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2.5 text-sm text-slate-100 ring-1 ring-transparent transition outline-none focus:border-sky-500 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </form>

            <div className="my-3 flex items-center gap-3 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
              <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
              or upload file
              <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
            </div>

            <label className="group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/90 bg-slate-900/60 px-4 py-5 text-center text-xs text-slate-300/90 transition hover:border-sky-500 hover:bg-slate-900/80">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded-full bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-sky-300">
                  Upload video
                </span>
                <span className="text-slate-400">MP4 / MOV / WebM</span>
              </div>
              <p className="max-w-xs text-[11px] text-slate-500">
                {selectedUploadFileName
                  ? selectedUploadFileName
                  : "Drop a file here or click to browse from your computer."}
              </p>
              {selectedUploadFileName && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    clearSelectedUploadFile();
                  }}
                  className="relative z-10 rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
                >
                  Clear file
                </button>
              )}
              <input
                key={uploadInputResetKey}
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={loading}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        )}

        {isQuoteReel && (
          <QuoteReelInputSection
            quoteMode={quoteMode}
            setQuoteMode={setQuoteMode}
            quotePrompt={quotePrompt}
            setQuotePrompt={setQuotePrompt}
            quoteText={quoteText}
            setQuoteText={setQuoteText}
            autoAngle={autoAngle}
            setAutoAngle={setAutoAngle}
            batchCount={batchCount}
            setBatchCount={setBatchCount}
            anglesLoading={anglesLoading}
            angleCandidates={angleCandidates}
            selectedAngleIdx={selectedAngleIdx}
            onPreviewAngles={onPreviewAngles}
            onToggleAngle={onToggleAngle}
            loading={loading}
          />
        )}

        {isMultiSourceEdit && (
          <MultiSourceEditSection
            jobGoal={jobGoal}
            sources={multiSourceInputs}
            segments={multiSourceSegments}
            onAddSource={onAddMultiSourceInput}
            onRemoveSource={onRemoveMultiSourceInput}
            onChangeSourceUrl={onChangeMultiSourceUrl}
            onAddSegment={onAddMultiSourceSegment}
            onRemoveSegment={onRemoveMultiSourceSegment}
            onChangeSegment={onChangeMultiSourceSegment}
          />
        )}
      </Step>

      {/* STEP 3 — FORMAT & LOOK */}
      <Step num={3} title="Format & look" hint={step3Hint} accent={accent}>
        {isShorts && (
          <div className="space-y-4">
            <OutputFormatSection
              aspect={aspect}
              setAspect={setAspect}
              shortsOutputMode={shortsOutputMode}
              setShortsOutputMode={setShortsOutputMode}
              showLocalOutputModes={showLocalOutputModes}
              isQuoteReel={false}
              optimizedLabel={optimizedLabel}
            />

            <ShortsSelectionSection
              jobGoal={jobGoal}
              selectionMode={selectionMode}
              setSelectionMode={setSelectionMode}
              customRanges={customRanges}
              onAddClip={onAddCustomClip}
              onRemoveClip={onRemoveCustomClip}
              onAddRange={onAddCustomRange}
              onRemoveRange={onRemoveCustomRange}
              onChangeRange={onChangeCustomRange}
            />

            {selectionMode !== "custom" && (
              <ClipSettingsSection
                jobGoal={jobGoal}
                clipDurationSec={clipDurationSec}
                setClipDurationSec={setClipDurationSec}
                maxClips={maxClips}
                setMaxClips={setMaxClips}
                generateTitles={generateTitles}
                setGenerateTitles={setGenerateTitles}
              />
            )}

            <CaptionsSection
              captionsEnabled={captionsEnabled}
              setCaptionsEnabled={setCaptionsEnabled}
              captionStyle={captionStyle}
              setCaptionStyle={setCaptionStyle}
            />
          </div>
        )}

        {isQuoteReel && (
          <QuoteReelSettingsSection
            quoteTone={quoteTone}
            setQuoteTone={setQuoteTone}
            quoteVisualSource={quoteVisualSource}
            setQuoteVisualSource={setQuoteVisualSource}
            voiceEnabled={voiceEnabled}
            setVoiceEnabled={setVoiceEnabled}
            voicePreset={voicePreset}
            setVoicePreset={setVoicePreset}
            posterEnabled={posterEnabled}
            setPosterEnabled={setPosterEnabled}
            captionsEnabled={captionsEnabled}
            setCaptionsEnabled={setCaptionsEnabled}
            quoteCaptionPreset={quoteCaptionPreset}
            setQuoteCaptionPreset={setQuoteCaptionPreset}
            targetDurationSec={targetDurationSec}
            setTargetDurationSec={setTargetDurationSec}
            minDurationSec={minDurationSec}
            setMinDurationSec={setMinDurationSec}
            maxDurationSec={maxDurationSec}
            setMaxDurationSec={setMaxDurationSec}
          />
        )}

        {isMultiSourceEdit && (
          <OutputFormatSection
            aspect={aspect}
            setAspect={setAspect}
            shortsOutputMode={shortsOutputMode}
            setShortsOutputMode={setShortsOutputMode}
            showLocalOutputModes={false}
            isQuoteReel={false}
            optimizedLabel={optimizedLabel}
          />
        )}
      </Step>
    </section>
  );
}
