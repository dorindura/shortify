export type LocalJobAspect = "horizontal" | "vertical" | "verticalLetterbox" | "verticalFit";
export type LocalCaptionStyle =
  | "boldYellow"
  | "subtle"
  | "karaoke"
  | "wordByWord"
  | "progressiveWords";
export type LocalJobGoal = "shorts" | "summary" | "quote_reel" | "multi_source_edit";
export type LocalQuoteTone = "aggressive" | "cinematic" | "calm" | "dark" | "emotional" | "stoic";

export type LocalShortsSelectionMode = "auto" | "custom";
export type LocalShortsOutputMode = "shorts" | "full_x2_local";
export type LocalQuoteReelMode = "manual_text" | "ai_text";
export type LocalQuoteVisualSource = "auto" | "cartoons";
export type LocalQuoteVoicePreset =
  | "dark_male"
  | "storyteller"
  | "soft_female"
  | "motivational_male"
  | "neutral";

export type LocalQuoteCaptionPreset =
  | "card_bottom_karaoke"
  | "card_center_word_by_word"
  | "card_center_progressive_words"
  | "card_center_premium_word"
  | "card_bottom_premium_karaoke";

export type CustomClipRange = {
  id: string;
  startSec: string;
  endSec: string;
};

export type CustomRange = {
  id: string;
  ranges: CustomClipRange[];
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
