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
  "abandoned_places",
  "addiction",
  "alarm_snoozing",
  "anger",
  "anxiety",
  "arriving",
  "attention",
  "awkward",
  "bedroom",
  "betrayal",
  "blocked",
  "bond",
  "books",
  "bridge",
  "broken",
  "broken_glass",
  "cafe",
  "calm",
  "candles",
  "cemetery",
  "censored",
  "chaos",
  "city_night",
  "clock",
  "confidence",
  "curiosity",
  "dark",
  "determination",
  "disappointment",
  "doors",
  "drinking_coffee",
  "driving",
  "duo",
  "emotional",
  "empathy",
  "escaping",
  "faceless",
  "fake",
  "fight",
  "fire",
  "forest",
  "forgiveness",
  "friendship",
  "gym",
  "group",
  "group_dynamics",
  "healing",
  "helping",
  "hope",
  "ignoring",
  "included",
  "intense",
  "judged",
  "kindness",
  "leaving",
  "listening",
  "looking_down",
  "looking_in_mirror",
  "loneliness",
  "love",
  "mirror",
  "money",
  "mountains",
  "movement",
  "negation",
  "nostalgia",
  "observing",
  "office",
  "ocean",
  "opening_door",
  "pain",
  "peace",
  "phone",
  "protecting",
  "proudness",
  "public_transport",
  "rain",
  "reacting",
  "reflection",
  "regret",
  "revealing",
  "resilience",
  "room",
  "roads",
  "running",
  "sadness",
  "school",
  "scrolling_phone",
  "self_respect",
  "shadows",
  "shock",
  "silhouette",
  "sitting",
  "sky",
  "slow_motion",
  "soldier",
  "stars",
  "standing_still",
  "staring",
  "stepping",
  "stoic",
  "street",
  "strength",
  "sunrise",
  "sunset",
  "thinking",
  "toxic",
  "train",
  "train_station",
  "walking",
  "window",
  "working",
  "writing",
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

  if (safeTarget <= 55) return 14;
  if (safeTarget <= 70) return 18;
  if (safeTarget <= 90) return 22;
  if (safeTarget <= 120) return 28;

  return 34;
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
    const textParts = splitSegmentTextForReel(segment.text, 14);
    const voiceParts = splitSegmentTextForReel(
      segment.voiceoverText || segment.text,
      14,
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

function stripScriptRoleLabels(value: string) {
  return normalizeWhitespace(
    value.replace(/\b(?:hook|setup|build|built|payoff|cta)\s*:\s*/gi, ""),
  );
}

function splitIntoSentences(text: string): string[] {
  const normalized = stripScriptRoleLabels(text);
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
    add("anger", "intense", "chaos", "fight");
  }

  if (/\b(addict|addiction|obsessed|dopamine|craving)\b/.test(lower)) {
    add("addiction", "scrolling_phone", "phone");
  }

  if (/\b(toxic|manipulate|gaslight|poison|poisoned)\b/.test(lower)) {
    add("toxic", "fake", "dark");
  }

  if (/\b(blocked|block|censored|silenced|muted)\b/.test(lower)) {
    add("blocked", "negation", "censored");
  }

  if (/\b(pain|hurt|wound|broken|betray|disappointment|suffer)\b/.test(lower)) {
    add("pain", "sadness", "rain", "broken");
  }

  if (/\b(betray|betrayal|lied|fake friend|backstab)\b/.test(lower)) {
    add("betrayal", "fake", "broken_glass");
  }

  if (/\b(disappoint|disappointment|let down)\b/.test(lower)) {
    add("disappointment", "sadness", "looking_down");
  }

  if (/\b(forgive|forgiveness|peace|release|let go|healing)\b/.test(lower)) {
    add("forgiveness", "peace", "healing");
  }

  if (/\b(alone|lonely|loneliness|nobody|isolated)\b/.test(lower)) {
    add("alone", "loneliness", "window");
  }

  if (/\b(strength|strong|power|discipline|resilience|stoic)\b/.test(lower)) {
    add("strength", "resilience", "stoic", "determination");
  }

  if (/\b(proud|pride|earned it|made it)\b/.test(lower)) {
    add("proudness", "confidence", "strength");
  }

  if (/\b(think|thinking|understand|realize|mind|reflection)\b/.test(lower)) {
    add("thinking", "reflection", "observing");
  }

  if (/\b(walk|walking|move on|keep going|journey|run|running)\b/.test(lower)) {
    add("walking", "movement", "street", "running");
  }

  if (/\b(love|kindness|heart|gentle|soft)\b/.test(lower)) {
    add("kindness", "love", "empathy", "helping");
  }

  if (/\b(crowd|people|group|everyone|most people)\b/.test(lower)) {
    add("group", "group_dynamics", "observing");
  }

  if (/\b(stare|staring|looked at|watching)\b/.test(lower)) {
    add("staring", "observing");
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

  if (/\b(room|bedroom|office|school|class|gym|cafe)\b/.test(lower)) {
    if (/\bbedroom\b/.test(lower)) add("bedroom");
    if (/\boffice|work|working\b/.test(lower)) add("office", "working");
    if (/\bschool|class\b/.test(lower)) add("school");
    if (/\bgym|training\b/.test(lower)) add("gym");
    if (/\bcafe|coffee\b/.test(lower)) add("cafe", "drinking_coffee");
    add("room");
  }

  if (/\b(phone|scroll|scrolling|texting)\b/.test(lower)) {
    add("phone", "scrolling_phone");
  }

  if (/\b(drive|driving|car|arrive|arriving|leave|leaving|door|bus|train|transport)\b/.test(lower)) {
    if (/\b(drive|driving|car)\b/.test(lower)) add("driving");
    if (/\b(arrive|arriving)\b/.test(lower)) add("arriving");
    if (/\b(leave|leaving)\b/.test(lower)) add("leaving");
    if (/\bdoor\b/.test(lower)) add("doors", "opening_door");
    if (/\b(bus|transport)\b/.test(lower)) add("public_transport");
  }

  if (/\b(mirror|look at yourself|reflection)\b/.test(lower)) {
    add("mirror", "looking_in_mirror");
  }

  if (/\b(book|books|write|writing|study|learn)\b/.test(lower)) {
    if (/\b(book|books|study|learn)\b/.test(lower)) add("books");
    if (/\b(write|writing)\b/.test(lower)) add("writing");
  }

  if (/\b(money|rich|wealth|price|cost)\b/.test(lower)) {
    add("money");
  }

  if (/\b(forest|mountain|road|bridge|train|station|cemetery|grave)\b/.test(lower)) {
    if (/\bforest\b/.test(lower)) add("forest");
    if (/\bmountain\b/.test(lower)) add("mountains");
    if (/\b(road|path)\b/.test(lower)) add("roads");
    if (/\bbridge\b/.test(lower)) add("bridge");
    if (/\btrain\b/.test(lower)) add("train", "train_station");
    if (/\bstation\b/.test(lower)) add("train_station");
    if (/\b(cemetery|grave)\b/.test(lower)) add("cemetery");
  }

  if (/\b(step|stepping)\b/.test(lower)) {
    add("stepping", "movement");
  }

  if (/\b(alarm|snooze|woke up|wake up)\b/.test(lower)) {
    add("alarm_snoozing", "clock");
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
  const sentences = splitIntoSentences(stripScriptRoleLabels(text));
  const microSegments = sentences.flatMap((sentence) =>
    splitLongSentence(sentence, 14)
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
    .map((item, index, arr): QuoteReelSegment | null => {
      const text = stripScriptRoleLabels(String(item?.text ?? ""));
      const voiceoverText = stripScriptRoleLabels(
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
    .filter((item): item is QuoteReelSegment => item !== null);

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
You create viral vertical explainer scripts for reels and TikTok.

Goals:
- Write a script that usually supports at least 60 seconds of spoken narration.
- Make it emotionally engaging, curiosity-driven, and retention-friendly.
- Break the script into intentional short segments.
- Prefer around 16 to 24 segments for most 60 to 90 second reels.
- Each segment should contain one complete micro-idea, not a tiny fragment.
- Most segments should be 5 to 12 words on screen.
- Visual changes should feel directed and motivated, not like a random slideshow.
- Do not return long paragraph-like segments.
- The pacing should feel premium and cinematic, not robotic.
- The user wants premium retention pacing with enough time for each visual to land.

Viral structure:
- Open with a specific tension, not a generic quote.
- The first 3 seconds must create a curiosity gap or unresolved problem.
- Prefer formats like:
  "If someone does X, try this."
  "Most people miss this signal."
  "There are 3 steps."
  "This is the method nobody explains."
- Give the concept a memorable name when useful, like "Red Shirt Method" or "The Mirror Test".
- Use a clear arc: hook -> problem -> why it works -> step 1 -> step 2 -> step 3 -> payoff -> CTA.
- Include at least 2 step/setup segments when the topic supports it.
- Every 5 to 8 segments, add a mini-payoff, twist, or "but here's the catch" moment.

Rules:
- Return JSON only.
- Do not include markdown.
- Write in the same language as the user's topic or source text.
- Never include segment labels in generatedText, finalScript, text, or voiceoverText.
- Forbidden text prefixes: "hook:", "setup:", "build:", "built:", "payoff:", "cta:".
- The "type" field is metadata only; it must never be spoken or shown as caption text.
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
- Make it sound human, direct, viral and emotionally intelligent.
- Avoid vague lines like "life is hard", "be yourself", "protect your peace" unless they are tied to a concrete action.
- Use second person often.
- Make captions feel like someone is revealing a useful social or psychological pattern.
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

Create a viral explainer reel script with a strong hook, a named method or clear steps, and a payoff.
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
You transform user-provided text into a segmented viral explainer video plan.

Goals:
- Preserve the meaning and emotional core of the user's text.
- Rewrite lightly when needed so the output has a stronger hook, clearer stakes, and a better payoff.
- Break it into many short segments for frequent visual changes.
- Keep the script natural for voice-over.
- Turn abstract reflection into concrete social/psychological observations where possible.
- Prefer a structure with hook, problem, method/steps, payoff and a subtle CTA.
- Use only segment types from:
  hook, setup, build, payoff, cta
- Use only visual tags from this allowed list:
${ALLOWED_VISUAL_TAGS.join(", ")}

Rules:
- Return JSON only.
- Write in the same language as the source text.
- Never include segment labels in generatedText, finalScript, text, or voiceoverText.
- Forbidden text prefixes: "hook:", "setup:", "build:", "built:", "payoff:", "cta:".
- The "type" field is metadata only; it must never be spoken or shown as caption text.
- Do not add fake quotes.
- Preserve the user's voice as much as possible.
- If the source text is too short for the target duration, lightly expand it with a short intro/payoff/CTA if needed.
- If addCta is false, do not include CTA.
- If addCta is true, keep CTA subtle.
- Break the text into intentional short micro-scenes.
- Prefer around 16 to 24 segments for a 60 to 90 second reel.
- Most on-screen text segments should stay short.
- Visual changes should be frequent enough for retention, but coherent enough to feel edited.
- The first segment must be a strong hook, not an intro.
- Add a named method/test/framework when it naturally fits the text.
- Avoid vague standalone fragments that lose context.

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
        stripScriptRoleLabels(ai.finalScript || ai.generatedText || sourceText) ||
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
        generatedText: stripScriptRoleLabels(ai.generatedText || "") ||
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

  const generatedText = stripScriptRoleLabels(ai.generatedText || "");
  const finalScript = stripScriptRoleLabels(ai.finalScript || generatedText);

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

export function buildQuoteReelPlanFromFinalScript(input: {
  finalScript: string;
  tone: QuoteReelTone;
  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  addCta?: boolean;
  sourceMode?: QuoteReelMode;
  sourceText?: string;
  generatedText?: string;
  instagramCaption?: string;
  hashtags?: string[];
  musicSuggestions?: QuoteReelMusicSuggestion[];
}): QuoteReelScriptPlan {
  const finalScript = stripScriptRoleLabels(input.finalScript);
  if (!finalScript) {
    throw new Error("finalScript is required");
  }

  const targetDurationSec = clamp(input.targetDurationSec ?? 70, 45, 180);
  const addCta = input.addCta ?? true;
  const fallbackBaseSegments = buildFallbackSegmentsFromText(finalScript, input.tone, addCta);
  const segments = densifySegments(fallbackBaseSegments, input.tone, targetDurationSec, addCta);
  const hashtags = normalizeHashtags(input.hashtags).length
    ? normalizeHashtags(input.hashtags)
    : defaultHashtagsForTone(input.tone);
  const musicSuggestions = normalizeMusicSuggestions(input.musicSuggestions).length
    ? normalizeMusicSuggestions(input.musicSuggestions)
    : defaultMusicSuggestionsForTone(input.tone);

  return {
    sourceMode: input.sourceMode ?? "manual_text",
    sourceText: input.sourceText,
    generatedText: input.generatedText,
    finalScript,
    segments,
    instagramCaption: normalizeWhitespace(input.instagramCaption || "") ||
      buildManualCaption(finalScript, input.tone),
    hashtags,
    musicSuggestions,
  };
}
