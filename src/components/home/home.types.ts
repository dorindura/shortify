export type LocalJobAspect = "horizontal" | "vertical" | "verticalLetterbox";
export type LocalCaptionStyle = "boldYellow" | "subtle" | "karaoke";
export type LocalJobGoal = "shorts" | "summary" | "quote_reel" | "multi_source_edit";
export type LocalQuoteTone = "aggressive" | "cinematic" | "calm" | "dark";
export type LocalShortsSelectionMode = "auto" | "custom";

export type CustomRange = {
  id: string;
  startSec: string;
  endSec: string;
};

export type MultiSourceInput = {
  id: string;
  url: string;
};

export type MultiSourceSegmentDraft = {
  id: string;
  sourceId: string;
  startSec: string;
  endSec: string;
  order: number;
};
