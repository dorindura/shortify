// src/lib/jobsStore.ts
export type JobStatus = "pending" | "processing" | "done" | "failed";
export type ShortsSelectionMode = "auto" | "custom";
export type JobType = "upload" | "url" | "quote_reel" | "multi_source_edit";
export type JobAspect = "horizontal" | "vertical" | "verticalLetterbox";
export type CaptionStyle = "boldYellow" | "subtle" | "karaoke";

export type JobStage =
  | "queued"
  | "planning"
  | "script_generation"
  | "voiceover"
  | "asset_selection"
  | "downloading"
  | "captioning"
  | "scoring"
  | "clipping"
  | "assembling"
  | "review_ready"
  | "rendering"
  | "uploading"
  | "finished";

export type JobGoal = "shorts" | "summary" | "quote_reel" | "multi_source_edit";

export type QuoteReelTone = "aggressive" | "cinematic" | "calm" | "dark" | "emotional" | "stoic";

export type QuoteReelMode = "manual_text" | "ai_text";

export type QuoteReelVoicePreset =
  | "dark_male"
  | "storyteller"
  | "soft_female"
  | "motivational_male"
  | "neutral";

export type QuoteReelSegmentType = "hook" | "setup" | "build" | "payoff" | "cta";

export type QuoteReelCaptionPreset =
  | "card_bottom_karaoke"
  | "card_center_word_by_word"
  | "card_center_premium_word"
  | "card_bottom_premium_karaoke";

export type ShortsCustomRange = {
  id: string;
  startSec: number;
  endSec: number;
};

export type ShortsConfig = {
  selectionMode: ShortsSelectionMode;
  customRanges?: ShortsCustomRange[];
};

export type CaptionDraftWord = {
  text: string;
  startSec: number;
  endSec: number;
};

export type CaptionDraftChunk = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words?: CaptionDraftWord[];
};

export type CaptionDraftClip = {
  clipIndex: number;
  chunks: CaptionDraftChunk[];
};

export type TextOverlayPosition = "top" | "center" | "bottom";

export type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
};

export type QuoteReelSegment = {
  id: string;
  index: number;
  type: QuoteReelSegmentType;
  text: string;
  voiceoverText: string;
  visualTags: string[];
  durationSec?: number;
};

export type QuoteReelAssetType = "video" | "image";

export type QuoteReelAssetPick = {
  segmentId: string;
  assetType: QuoteReelAssetType;
  assetPath: string;
  sourceCategory?: string;
  startSec?: number;
  endSec?: number;
};

export type QuoteReelMusicSuggestion = {
  label: string;
  searchQuery: string;
  reason?: string;
};

export type QuoteReelVoiceoverMeta = {
  enabled: boolean;
  voicePreset?: QuoteReelVoicePreset;
  voiceId?: string;
  modelId?: string;
  audioPath?: string;
  audioUrl?: string;
  durationSec?: number;
  captionDraft?: CaptionDraftClip;
};

export type QuoteReelMeta = {
  mode?: QuoteReelMode;
  tone?: QuoteReelTone;

  sourceText?: string;
  generatedText?: string;
  finalScript?: string;

  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  actualDurationSec?: number;

  captionsEnabled?: boolean;
  captionStyle?: CaptionStyle;

  voiceEnabled?: boolean;
  voicePreset?: QuoteReelVoicePreset;

  segments?: QuoteReelSegment[];
  selectedAssets?: QuoteReelAssetPick[];
  captionPreset?: QuoteReelCaptionPreset;

  instagramCaption?: string;
  hashtags?: string[];
  musicSuggestions?: QuoteReelMusicSuggestion[];

  voiceover?: QuoteReelVoiceoverMeta;
};

export type SmartCropSegment = {
  tStart: number;
  tEnd: number;
  centerXNorm: number;
};

export type SmartCropBox = {
  segments: SmartCropSegment[];
};

export type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";

export type EndingPosition = "top" | "center" | "bottom";
export type EndingEmojiPlacement = "left" | "right" | "center";

export type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  durationSec?: number;
  emoji?: string;
  emojiPlacement?: EndingEmojiPlacement;
  position?: EndingPosition;
};

export type MultiSourceSegment = {
  id: string;
  sourceId: string;
  url: string;
  startSec: number;
  endSec: number;
  order: number;
};

export type FinalTimelineOverlayPosition = "top" | "center" | "bottom";

export type FinalTimelineOverlay = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  position: FinalTimelineOverlayPosition;
  emoji?: string | null;
  emojiPlacement?: "left" | "right";
};

export type MultiSourceBlackWhiteRange = {
  id: string;
  startSec: number;
  endSec: number;
};

export type MultiSourceReviewConfig = {
  textOverlays?: FinalTimelineOverlay[];
  blackWhiteRanges?: MultiSourceBlackWhiteRange[];
  ending?: EndingConfig | null;
};

export type MultiSourceEditConfig = {
  segments: MultiSourceSegment[];
  draftVideoUrl?: string;
  finalVideoUrl?: string;
  reviewConfig?: MultiSourceReviewConfig;
};

export type Job = {
  id: string;
  ownerId: string;
  type: JobType;
  source: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  aspect?: JobAspect;
  clipDurationSec?: number;
  maxClips?: number;
  captionsEnabled?: boolean;
  captionStyle?: CaptionStyle;
  blackAndWhite?: boolean;
  multiSourceEditConfig?: MultiSourceEditConfig;

  clips?: string[];
  previewClips?: string[];
  captionedClips?: string[];
  captionedThumbs?: string[];
  stage?: JobStage;
  progress?: number;

  jobGoal?: JobGoal;
  summaryTargetSec?: number;

  quotePrompt?: string;
  quoteReelMeta?: QuoteReelMeta;
  shortsConfig?: ShortsConfig;

  captionDrafts?: CaptionDraftClip[];
  textOverlays?: TextOverlay[];
  reviewReady?: boolean;

  smartCrops?: (SmartCropBox | null)[];
  ending?: EndingConfig;
};

const jobs: Job[] = [];

export function listJobsByOwner(ownerId: string): Job[] {
  return jobs
    .filter((j) => j.ownerId === ownerId)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function addJob(job: Job) {
  jobs.push(job);
}

export function listJobs(): Job[] {
  return jobs.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function updateJobStatus(id: string, status: JobStatus) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.status = status;
    job.updatedAt = new Date().toISOString();
  }
}

export function getJob(id: string) {
  return jobs.find((j) => j.id === id) ?? null;
}

export function setJobClips(id: string, clips: string[]) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.clips = clips;
    job.updatedAt = new Date().toISOString();
  }
}

export function setJobCaptionedClips(id: string, urls: string[]) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.captionedClips = urls;
    job.updatedAt = new Date().toISOString();
  }
}

export function setJobCaptionedResults(id: string, clipUrls: string[], thumbUrls: string[]) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.captionedClips = clipUrls;
    job.captionedThumbs = thumbUrls;
    job.updatedAt = new Date().toISOString();
  }
}

export function updateJobStage(id: string, stage: JobStage, progress?: number) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.stage = stage;
    if (typeof progress === "number") {
      job.progress = progress;
    }
    job.updatedAt = new Date().toISOString();
  }
}

export function updateJobProgress(id: string, progress: number) {
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.progress = progress;
    job.updatedAt = new Date().toISOString();
  }
}
