// src/server/ai/quoteReelScriptGenerator.ts
import OpenAI from "openai";
import { randomUUID } from "crypto";
import type {
  QuoteReelMode,
  QuoteReelMusicSuggestion,
  QuoteReelSegment,
  QuoteReelSegmentType,
  QuoteReelTone,
} from "@lib/jobsStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const ALLOWED_VISUAL_TAGS = [
  "alone",
  "anger",
  "anxiety",
  "arriving",
  "attention",
  "awkward",
  "bond",
  "calm",
  "chaos",
  "city_night",
  "confidence",
  "curiosity",
  "dark",
  "duo",
  "emotional",
  "empathy",
  "faceless",
  "fire",
  "forgiveness",
  "friendship",
  "group",
  "healing",
  "hope",
  "ignoring",
  "included",
  "intense",
  "judged",
  "kindness",
  "leaving",
  "listening",
  "loneliness",
  "love",
  "movement",
  "nostalgia",
  "observing",
  "ocean",
  "pain",
  "peace",
  "protecting",
  "rain",
  "reacting",
  "reflection",
  "regret",
  "resilience",
  "room",
  "sadness",
  "self_respect",
  "shadows",
  "shock",
  "silhouette",
  "sky",
  "slow_motion",
  "stars",
  "stoic",
  "street",
  "strength",
  "sunrise",
  "sunset",
  "thinking",
  "walking",
  "window",
] as const;

type AllowedVisualTag = (typeof ALLOWED_VISUAL_TAGS)[number];

export type QuoteReelScriptPlan = {
  sourceMode: QuoteReelMode;
  sourceText?: string;
  generatedText?: string;
  finalScript: string;
  segments: QuoteReelSegment[];
  instagramCaption: string;
  hashtags: string[];
  musicSuggestions: QuoteReelMusicSuggestion[];
};

type GenerateQuoteReelScriptInput = {
  mode: QuoteReelMode;
  tone: QuoteReelTone;
  prompt?: string;
  text?: string;
  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  addCta?: boolean;
};

type AiQuoteReelSegment = {
  text: string;
  voiceoverText?: string;
  type?: QuoteReelSegmentType;
  visualTags?: string[];
};

type AiQuoteReelScriptResponse = {
  generatedText?: string;
  finalScript?: string;
  instagramCaption?: string;
  hashtags?: string[];
  musicSuggestions?: Array<{
    label?: string;
    searchQuery?: string;
    reason?: string;
  }>;
  segments?: AiQuoteReelSegment[];
};

function estimateTargetSegmentCount(targetDurationSec: number) {
  const safeTarget = clamp(targetDurationSec || 70, 45, 180);

  if (safeTarget <= 55) return 16;
  if (safeTarget <= 70) return 20;
  if (safeTarget <= 90) return 24;
  if (safeTarget <= 120) return 30;

  return 36;
}

function splitSegmentTextForReel(text: string, maxWords = 10): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const sentenceParts = splitIntoSentences(normalized);
  const chunks: string[] = [];

  for (const sentence of sentenceParts) {
    const smaller = splitLongSentence(sentence, maxWords);
    chunks.push(...smaller);
  }

  return chunks.map((item) => normalizeWhitespace(item)).filter(Boolean);
}

function densifySegments(
  segments: QuoteReelSegment[],
  tone: QuoteReelTone,
  targetDurationSec: number,
  addCta = true,
): QuoteReelSegment[] {
  const desiredCount = estimateTargetSegmentCount(targetDurationSec);

  const expanded = segments.flatMap((segment) => {
    const textParts = splitSegmentTextForReel(segment.text, 10);
    const voiceParts = splitSegmentTextForReel(
      segment.voiceoverText || segment.text,
      10,
    );

    const partCount = Math.max(textParts.length, voiceParts.length, 1);

    if (partCount <= 1) {
      return [segment];
    }

    return Array.from({ length: partCount }).map((_, index) => {
      const text = textParts[index] || textParts[textParts.length - 1] ||
        segment.text;

      const voiceoverText = voiceParts[index] ||
        voiceParts[voiceParts.length - 1] ||
        segment.voiceoverText ||
        text;

      return {
        id: randomUUID(),
        index: 0,
        type: segment.type,
        text,
        voiceoverText,
        visualTags: segment.visualTags?.length
          ? segment.visualTags.slice(0, 4)
          : inferVisualTagsFromText(text, tone),
      } satisfies QuoteReelSegment;
    });
  });

  let finalSegments = expanded;

  // if still too few, rebuild from final script-ish combined text
  if (finalSegments.length < desiredCount * 0.7) {
    const mergedText = finalSegments.map((s) => s.voiceoverText || s.text).join(
      " ",
    );
    finalSegments = buildFallbackSegmentsFromText(mergedText, tone, addCta);
  }

  return finalSegments.map((segment, index, arr) => ({
    ...segment,
    id: segment.id || randomUUID(),
    index,
    type: sanitizeSegmentType(segment.type, index, arr.length),
    visualTags: segment.visualTags?.length
      ? segment.visualTags.slice(0, 4)
      : inferVisualTagsFromText(segment.text, tone),
  }));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return matches.map((item) => normalizeWhitespace(item)).filter(Boolean);
}

function splitLongSentence(sentence: string, maxWords = 16): string[] {
  const normalized = normalizeWhitespace(sentence);
  if (!normalized) return [];

  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= maxWords) return [normalized];

  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);

    if (current.length >= maxWords) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  if (current.length) {
    chunks.push(current.join(" "));
  }

  return chunks.map((item) => normalizeWhitespace(item)).filter(Boolean);
}

function estimateWordsForDuration(targetDurationSec: number) {
  const safeTarget = clamp(targetDurationSec || 70, 45, 180);

  // 145 wpm ~= 2.41 words/sec
  return Math.round(safeTarget * 2.4);
}

function sanitizeSegmentType(
  value: string | undefined,
  index: number,
  total: number,
): QuoteReelSegmentType {
  if (
    value === "hook" ||
    value === "setup" ||
    value === "build" ||
    value === "payoff" ||
    value === "cta"
  ) {
    return value;
  }

  if (index === 0) return "hook";
  if (index === total - 1) return "cta";
  if (index >= total - 2) return "payoff";
  if (index <= 2) return "setup";
  return "build";
}

function sanitizeVisualTags(tags: unknown): AllowedVisualTag[] {
  if (!Array.isArray(tags)) return [];

  const normalized = tags
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((tag): tag is AllowedVisualTag =>
      (ALLOWED_VISUAL_TAGS as readonly string[]).includes(tag)
    );

  return Array.from(new Set(normalized)).slice(0, 4);
}

function inferVisualTagsFromText(
  text: string,
  tone: QuoteReelTone,
): AllowedVisualTag[] {
  const lower = text.toLowerCase();
  const tags = new Set<AllowedVisualTag>();

  const add = (...items: AllowedVisualTag[]) =>
    items.forEach((item) => tags.add(item));

  if (/\b(anger|angry|mad|rage|furious|resentment|hate)\b/.test(lower)) {
    add("anger", "intense", "chaos");
  }

  if (/\b(pain|hurt|wound|broken|betray|disappointment|suffer)\b/.test(lower)) {
    add("pain", "sadness", "rain");
  }

  if (/\b(forgive|forgiveness|peace|release|let go|healing)\b/.test(lower)) {
    add("forgiveness", "peace", "healing");
  }

  if (/\b(alone|lonely|loneliness|nobody|isolated)\b/.test(lower)) {
    add("alone", "loneliness", "window");
  }

  if (/\b(strength|strong|power|discipline|resilience|stoic)\b/.test(lower)) {
    add("strength", "resilience", "stoic");
  }

  if (/\b(think|thinking|understand|realize|mind|reflection)\b/.test(lower)) {
    add("thinking", "reflection", "observing");
  }

  if (/\b(walk|walking|move on|keep going|journey)\b/.test(lower)) {
    add("walking", "movement", "street");
  }

  if (/\b(love|kindness|heart|gentle|soft)\b/.test(lower)) {
    add("kindness", "love", "empathy");
  }

  if (/\b(crowd|people|group|everyone|most people)\b/.test(lower)) {
    add("group", "observing");
  }

  if (/\b(night|dark|shadow|shadows)\b/.test(lower)) {
    add("dark", "shadows", "city_night");
  }

  if (/\b(rain|storm)\b/.test(lower)) {
    add("rain");
  }

  if (/\b(hope|future|sunrise|tomorrow)\b/.test(lower)) {
    add("hope", "sunrise", "sky");
  }

  if (/\b(window)\b/.test(lower)) {
    add("window");
  }

  if (/\b(room)\b/.test(lower)) {
    add("room");
  }

  if (tone === "dark") add("city_night", "shadows");
  if (tone === "cinematic") add("slow_motion", "silhouette");
  if (tone === "calm") add("calm", "peace", "sky");
  if (tone === "aggressive") add("intense", "fire");
  if (tone === "emotional") add("emotional", "rain");
  if (tone === "stoic") add("stoic", "thinking", "alone");

  if (tags.size === 0) {
    if (tone === "dark") add("city_night", "alone", "shadows");
    else if (tone === "calm") add("peace", "sky", "window");
    else if (tone === "aggressive") add("intense", "fire", "walking");
    else if (tone === "emotional") add("rain", "thinking", "alone");
    else if (tone === "stoic") add("stoic", "thinking", "walking");
    else add("thinking", "walking", "street");
  }

  return Array.from(tags).slice(0, 4);
}

function buildFallbackSegmentsFromText(
  text: string,
  tone: QuoteReelTone,
  addCta = true,
): QuoteReelSegment[] {
  const sentences = splitIntoSentences(text);
  const microSegments = sentences.flatMap((sentence) =>
    splitLongSentence(sentence, 10)
  );

  const filtered = microSegments
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)
    .filter((item) => item.split(" ").length >= 3);

  const segmentsBase = filtered.map((segmentText, index, arr) => ({
    id: randomUUID(),
    index,
    type: sanitizeSegmentType(undefined, index, arr.length),
    text: segmentText,
    voiceoverText: segmentText,
    visualTags: inferVisualTagsFromText(segmentText, tone),
  }));

  if (addCta && segmentsBase.length >= 5) {
    const last = segmentsBase[segmentsBase.length - 1];
    if (
      !/save this|follow for more|remember this|don't forget/i.test(last.text)
    ) {
      segmentsBase.push({
        id: randomUUID(),
        index: segmentsBase.length,
        type: "cta",
        text: "Save this if this spoke to you.",
        voiceoverText: "Save this if this spoke to you.",
        visualTags: inferVisualTagsFromText("peace reflection strength", tone),
      });
    }
  }

  return segmentsBase.map((segment, index) => ({
    ...segment,
    index,
  }));
}

function normalizeHashtags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
    .map((tag) => tag.replace(/\s+/g, ""))
    .filter((tag) => tag.length > 1);

  return Array.from(new Set(normalized)).slice(0, 12);
}

function normalizeMusicSuggestions(input: unknown): QuoteReelMusicSuggestion[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => ({
      label: normalizeWhitespace(String(item?.label ?? "")),
      searchQuery: normalizeWhitespace(String(item?.searchQuery ?? "")),
      reason: normalizeWhitespace(String(item?.reason ?? "")),
    }))
    .filter((item) => item.label && item.searchQuery)
    .slice(0, 5);
}

function normalizeAiSegments(
  input: unknown,
  tone: QuoteReelTone,
  fallbackText: string,
  addCta = true,
): QuoteReelSegment[] {
  if (!Array.isArray(input) || input.length === 0) {
    return buildFallbackSegmentsFromText(fallbackText, tone, addCta);
  }

  const rawSegments = input
    .map((item, index, arr) => {
      const text = normalizeWhitespace(String(item?.text ?? ""));
      const voiceoverText = normalizeWhitespace(
        String(item?.voiceoverText ?? text),
      );

      if (!text) return null;

      const sanitizedTags = sanitizeVisualTags(item?.visualTags);

      return {
        id: randomUUID(),
        index,
        type: sanitizeSegmentType(item?.type, index, arr.length),
        text,
        voiceoverText: voiceoverText || text,
        visualTags: sanitizedTags.length
          ? sanitizedTags
          : inferVisualTagsFromText(text, tone),
      };
    })
    .filter((item): item is QuoteReelSegment => !!item);

  if (!rawSegments.length) {
    return buildFallbackSegmentsFromText(fallbackText, tone, addCta);
  }

  return rawSegments.map((segment, index) => ({
    ...segment,
    index,
  }));
}

function buildManualCaption(text: string, tone: QuoteReelTone): string {
  const firstSentence = splitIntoSentences(text)[0] ?? text;
  const trimmed = normalizeWhitespace(firstSentence);

  if (trimmed.length <= 120) {
    return `${trimmed} ${
      tone === "stoic" ? "Read that again." : "This one hits deeper than most."
    }`.trim();
  }

  return `${trimmed.slice(0, 117).trim()}...`;
}

function defaultHashtagsForTone(tone: QuoteReelTone): string[] {
  const common = [
    "#mindset",
    "#motivation",
    "#selfgrowth",
    "#quotes",
    "#viralvideo",
  ];

  if (tone === "dark") {
    return [...common, "#darkpsychology", "#deepthoughts", "#nightvibes"];
  }
  if (tone === "calm") {
    return [...common, "#innerpeace", "#healing", "#calmvibes"];
  }
  if (tone === "aggressive") {
    return [...common, "#discipline", "#beastmode", "#winnermindset"];
  }
  if (tone === "emotional") {
    return [...common, "#emotional", "#healingjourney", "#relatable"];
  }
  if (tone === "stoic") {
    return [...common, "#stoicism", "#stoicmindset", "#selfrespect"];
  }

  return [...common, "#cinematic", "#deepthoughts", "#storytelling"];
}

function defaultMusicSuggestionsForTone(
  tone: QuoteReelTone,
): QuoteReelMusicSuggestion[] {
  if (tone === "dark") {
    return [
      {
        label: "Dark ambient edit",
        searchQuery: "dark ambient edit",
        reason: "Fits pain, isolation and late-night reflection.",
      },
      {
        label: "Little Dark Age type",
        searchQuery: "little dark age slowed edit",
        reason: "Works well for shadowy and introspective visuals.",
      },
      {
        label: "Cinematic tension",
        searchQuery: "cinematic tension instrumental",
        reason: "Keeps attention in long-form motivational reels.",
      },
    ];
  }

  if (tone === "calm") {
    return [
      {
        label: "Soft piano",
        searchQuery: "soft piano emotional",
        reason: "Supports healing and forgiveness themes.",
      },
      {
        label: "Ambient calm",
        searchQuery: "ambient calm instrumental",
        reason: "Leaves space for voice-over and captions.",
      },
      {
        label: "Peaceful cinematic",
        searchQuery: "peaceful cinematic instrumental",
        reason: "Good for reflective pacing.",
      },
    ];
  }

  if (tone === "aggressive") {
    return [
      {
        label: "Aggressive motivational",
        searchQuery: "aggressive motivational speech instrumental",
        reason: "Adds pressure and forward energy.",
      },
      {
        label: "Intense phonk",
        searchQuery: "intense phonk edit",
        reason: "Works for sharper edits and strong pacing.",
      },
      {
        label: "Cinematic rise",
        searchQuery: "epic cinematic rise",
        reason: "Good for payoff moments.",
      },
    ];
  }

  if (tone === "emotional") {
    return [
      {
        label: "Emotional piano",
        searchQuery: "emotional piano edit",
        reason: "Supports vulnerability and reflection.",
      },
      {
        label: "Sad ambient",
        searchQuery: "sad ambient instrumental",
        reason: "Fits heartbreak, pain and healing reels.",
      },
      {
        label: "Slow cinematic",
        searchQuery: "slow cinematic emotional",
        reason: "Good for storytelling with frequent scene changes.",
      },
    ];
  }

  if (tone === "stoic") {
    return [
      {
        label: "Stoic cinematic",
        searchQuery: "stoic cinematic instrumental",
        reason: "Strong fit for restraint and self-mastery themes.",
      },
      {
        label: "Interstellar type piano",
        searchQuery: "interstellar piano edit",
        reason: "Works well for contemplative scenes.",
      },
      {
        label: "Minimal tension",
        searchQuery: "minimal tension instrumental",
        reason: "Keeps intensity controlled and premium.",
      },
    ];
  }

  return [
    {
      label: "Cinematic motivational",
      searchQuery: "cinematic motivational instrumental",
      reason: "Balanced default for story-driven reels.",
    },
    {
      label: "Emotional edit audio",
      searchQuery: "emotional edit audio",
      reason: "Works across reflective and inspiring narratives.",
    },
    {
      label: "Slow powerful instrumental",
      searchQuery: "slow powerful instrumental",
      reason: "Good for long-form voice-over storytelling.",
    },
  ];
}

async function generateLongFormScriptFromPrompt(input: {
  prompt: string;
  tone: QuoteReelTone;
  targetDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  addCta: boolean;
}): Promise<AiQuoteReelScriptResponse> {
  const targetWords = estimateWordsForDuration(input.targetDurationSec);
  const minWords = estimateWordsForDuration(input.minDurationSec);
  const maxWords = estimateWordsForDuration(input.maxDurationSec);

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You create long-form vertical social media story scripts for reels and TikTok.

Goals:
- Write a script that usually supports at least 60 seconds of spoken narration.
- Make it emotionally engaging and retention-friendly.
- Break the script into MANY short segments.
- Prefer around 18 to 30 segments for most 60 to 90 second reels.
- Each segment should contain only one micro-idea.
- Most segments should be 4 to 12 words on screen.
- Frequent visual changes are critical.
- Do not return long paragraph-like segments.
- The pacing should feel premium and cinematic, not robotic.
- The user wants lots of visual changes, almost every idea getting a new visual.

Rules:
- Return JSON only.
- Do not include markdown.
- Segment text should usually be short, clean, and readable on-screen.
- voiceoverText can be slightly more natural than on-screen text, but should stay close.
- Use only segment types from:
  hook, setup, build, payoff, cta
- Use only visual tags from this allowed list:
${ALLOWED_VISUAL_TAGS.join(", ")}

Text writing rules:
- No emojis in the script.
- No numbered lists.
- Avoid generic fake guru phrases.
- Make it sound human, reflective, viral and emotionally intelligent.
- If addCta is false, do not add CTA.
- If addCta is true, CTA should be subtle and short.

Output JSON shape:
{
  "generatedText": "",
  "finalScript": "",
  "instagramCaption": "",
  "hashtags": [],
  "musicSuggestions": [
    {
      "label": "",
      "searchQuery": "",
      "reason": ""
    }
  ],
  "segments": [
    {
      "type": "hook",
      "text": "",
      "voiceoverText": "",
      "visualTags": ["attention", "thinking"]
    }
  ]
}
`,
      },
      {
        role: "user",
        content: `
Topic / niche: ${input.prompt}
Tone: ${input.tone}
Target duration seconds: ${input.targetDurationSec}
Minimum duration seconds: ${input.minDurationSec}
Maximum duration seconds: ${input.maxDurationSec}
Approximate target words: ${targetWords}
Approximate min words: ${minWords}
Approximate max words: ${maxWords}
Add CTA: ${input.addCta ? "yes" : "no"}
Desired segment count: around ${
          estimateTargetSegmentCount(input.targetDurationSec)
        }

Create a long-form story-driven reel script.
`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned empty content for ai_text mode");
  }

  return JSON.parse(content) as AiQuoteReelScriptResponse;
}

async function enrichManualTextIntoPlan(input: {
  text: string;
  tone: QuoteReelTone;
  targetDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  addCta: boolean;
}): Promise<AiQuoteReelScriptResponse> {
  const normalizedText = normalizeWhitespace(input.text);
  const wordCount = normalizedText.split(" ").filter(Boolean).length;
  const minWords = estimateWordsForDuration(input.minDurationSec);

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You transform user-provided long-form reflective text into a segmented short-video plan.

Goals:
- Preserve the meaning and emotional core of the user's text.
- Do NOT rewrite it heavily unless necessary for flow.
- Break it into many short segments for frequent visual changes.
- Keep the script natural for voice-over.
- Use only segment types from:
  hook, setup, build, payoff, cta
- Use only visual tags from this allowed list:
${ALLOWED_VISUAL_TAGS.join(", ")}

Rules:
- Return JSON only.
- Do not add fake quotes.
- Preserve the user's voice as much as possible.
- If the source text is too short for the target duration, lightly expand it with a short intro/payoff/CTA if needed.
- If addCta is false, do not include CTA.
- If addCta is true, keep CTA subtle.
- Break the text into many short micro-segments.
- Prefer around 18 to 30 segments for a 60 to 90 second reel.
- Most on-screen text segments should stay short.
- Frequent visual changes are mandatory.

Output JSON shape:
{
  "generatedText": "",
  "finalScript": "",
  "instagramCaption": "",
  "hashtags": [],
  "musicSuggestions": [
    {
      "label": "",
      "searchQuery": "",
      "reason": ""
    }
  ],
  "segments": [
    {
      "type": "hook",
      "text": "",
      "voiceoverText": "",
      "visualTags": ["attention", "thinking"]
    }
  ]
}
`,
      },
      {
        role: "user",
        content: `
Tone: ${input.tone}
Target duration seconds: ${input.targetDurationSec}
Minimum duration seconds: ${input.minDurationSec}
Maximum duration seconds: ${input.maxDurationSec}
Source text word count: ${wordCount}
Desired minimum words for timing: ${minWords}
Desired segment count: around ${
          estimateTargetSegmentCount(input.targetDurationSec)
        }
Add CTA: ${input.addCta ? "yes" : "no"}

User text:
${normalizedText}
`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned empty content for manual_text mode");
  }

  return JSON.parse(content) as AiQuoteReelScriptResponse;
}

export async function generateQuoteReelScriptPlan(
  input: GenerateQuoteReelScriptInput,
): Promise<QuoteReelScriptPlan> {
  const targetDurationSec = clamp(input.targetDurationSec ?? 70, 45, 180);
  const minDurationSec = clamp(input.minDurationSec ?? 60, 45, 180);
  const maxDurationSec = clamp(input.maxDurationSec ?? 95, 50, 240);
  const addCta = input.addCta ?? true;

  if (input.mode === "manual_text") {
    const sourceText = normalizeWhitespace(input.text ?? "");
    if (!sourceText) {
      throw new Error("manual_text mode requires text");
    }

    try {
      const ai = await enrichManualTextIntoPlan({
        text: sourceText,
        tone: input.tone,
        targetDurationSec,
        minDurationSec,
        maxDurationSec,
        addCta,
      });

      const finalScript =
        normalizeWhitespace(ai.finalScript || ai.generatedText || sourceText) ||
        sourceText;
      const baseSegments = normalizeAiSegments(
        ai.segments,
        input.tone,
        finalScript,
        addCta,
      );

      const segments = densifySegments(
        baseSegments,
        input.tone,
        targetDurationSec,
        addCta,
      );

      return {
        sourceMode: "manual_text",
        sourceText,
        generatedText: normalizeWhitespace(ai.generatedText || "") ||
          (finalScript !== sourceText ? finalScript : undefined),
        finalScript,
        segments,
        instagramCaption: normalizeWhitespace(ai.instagramCaption || "") ||
          buildManualCaption(finalScript, input.tone),
        hashtags: normalizeHashtags(ai.hashtags).length
          ? normalizeHashtags(ai.hashtags)
          : defaultHashtagsForTone(input.tone),
        musicSuggestions: normalizeMusicSuggestions(ai.musicSuggestions).length
          ? normalizeMusicSuggestions(ai.musicSuggestions)
          : defaultMusicSuggestionsForTone(input.tone),
      };
    } catch (error) {
      console.error(
        "[generateQuoteReelScriptPlan] manual_text AI enrich failed, using fallback:",
        error,
      );

      const fallbackBaseSegments = buildFallbackSegmentsFromText(
        sourceText,
        input.tone,
        addCta,
      );

      const fallbackSegments = densifySegments(
        fallbackBaseSegments,
        input.tone,
        targetDurationSec,
        addCta,
      );

      return {
        sourceMode: "manual_text",
        sourceText,
        generatedText: undefined,
        finalScript: sourceText,
        segments: fallbackSegments,
        instagramCaption: buildManualCaption(sourceText, input.tone),
        hashtags: defaultHashtagsForTone(input.tone),
        musicSuggestions: defaultMusicSuggestionsForTone(input.tone),
      };
    }
  }

  const prompt = normalizeWhitespace(input.prompt ?? "");
  if (!prompt) {
    throw new Error("ai_text mode requires prompt");
  }

  const ai = await generateLongFormScriptFromPrompt({
    prompt,
    tone: input.tone,
    targetDurationSec,
    minDurationSec,
    maxDurationSec,
    addCta,
  });

  const generatedText = normalizeWhitespace(ai.generatedText || "");
  const finalScript = normalizeWhitespace(ai.finalScript || generatedText);

  if (!finalScript) {
    throw new Error("AI text mode returned no finalScript");
  }

  const baseSegments = normalizeAiSegments(
    ai.segments,
    input.tone,
    finalScript,
    addCta,
  );

  const segments = densifySegments(
    baseSegments,
    input.tone,
    targetDurationSec,
    addCta,
  );

  return {
    sourceMode: "ai_text",
    sourceText: undefined,
    generatedText: generatedText || finalScript,
    finalScript,
    segments,
    instagramCaption: normalizeWhitespace(ai.instagramCaption || "") ||
      buildManualCaption(finalScript, input.tone),
    hashtags: normalizeHashtags(ai.hashtags).length
      ? normalizeHashtags(ai.hashtags)
      : defaultHashtagsForTone(input.tone),
    musicSuggestions: normalizeMusicSuggestions(ai.musicSuggestions).length
      ? normalizeMusicSuggestions(ai.musicSuggestions)
      : defaultMusicSuggestionsForTone(input.tone),
  };
}
