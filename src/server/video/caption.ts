import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { QuoteReelCaptionPreset } from "@/lib/jobsStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const SUBS_DIR = path.join(process.cwd(), "tmp", "subs");

async function ensureDir(dir: string) {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

type WhisperWord = {
  word: string;
  start: number;
  end: number;
};

type WhisperSegment = {
  id?: number;
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
};

type WhisperVerboseResponse = {
  text: string;
  duration?: number;
  segments: WhisperSegment[];
};

export type CaptionStyle = "boldYellow" | "subtle" | "karaoke" | "wordByWord" | "progressiveWords";

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

type SubtitleGenerationOptions = {
  captionStyle?: CaptionStyle;
  fontName?: string;
  quoteReelCaptionPreset?: QuoteReelCaptionPreset;
  captionOffsetSec?: number;
  premiumKeywords?: string[];
};

const DEFAULT_FONT = "Inter";
const CAPTION_FONT_ALIASES: Record<string, string> = {
  gluten: "Gluten Medium",
  "gluten regular": "Gluten Medium",
  "gluten-regular": "Gluten Medium",
};

const CHUNK_SIZE = 4;
const CAPTION_CHUNK_BREAK_GAP_SEC = Number(
  process.env.QUOTE_REEL_CAPTION_CHUNK_BREAK_GAP_SEC ?? 0.24,
);

const CAPTION_MAX_CHUNK_DURATION_SEC = Number(
  process.env.QUOTE_REEL_CAPTION_MAX_CHUNK_DURATION_SEC ?? 1.15,
);
const LINE_FADE_IN_MS = 40;
const LINE_FADE_OUT_MS = 80;
const KARAOKE_POP_SCALE = 118;
const KARAOKE_POP_IN_MS = 70;
const KARAOKE_POP_OUT_MS = 80;

const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;

const QUOTE_CARD_CENTER_X = 540;
const QUOTE_CARD_CENTER_Y = 960;
const QUOTE_CARD_BOTTOM_TEXT_Y = 1375;
const QUOTE_CARD_KARAOKE_FONT_SIZE = 74;
const QUOTE_CARD_WORD_BY_WORD_FONT_SIZE = 112;
const QUOTE_CARD_PROGRESSIVE_FONT_SIZE = 92;

const PREMIUM_FONT = process.env.QUOTE_REEL_CAPTION_FONT?.trim() || DEFAULT_FONT;

const DEFAULT_CAPTION_OFFSET_SEC = Number(process.env.QUOTE_REEL_CAPTION_OFFSET_SEC ?? 0);

const PREMIUM_HIGHLIGHT_WORDS = new Set(
  (
    process.env.QUOTE_REEL_HIGHLIGHT_WORDS ??
    "never,pain,discipline,respect,alone,truth,love,forgive,peace,strong,broken,healing,remember,change,life,heart,mind,silence,power"
  )
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean),
);

// ASS colors are BGR, not RGB.
// &H0000D7FF& = warm yellow/orange-ish highlight.
const PREMIUM_HIGHLIGHT_COLOR = "&H0000D7FF&";
const PREMIUM_WHITE_COLOR = "&H00FFFFFF&";
const PREMIUM_OUTLINE_COLOR = "&HEE000000&";

type ElevenLabsScribeWord = {
  text?: string;
  start?: number;
  end?: number;
  type?: string;
};

type ElevenLabsScribeResponse = {
  text?: string;
  words?: ElevenLabsScribeWord[];
};

async function transcribeAudioPathToDraftWithElevenLabs(
  audioPath: string,
  clipIndex: number,
): Promise<CaptionDraftClip> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  const audioBuffer = await fsp.readFile(audioPath);

  const form = new FormData();

  form.append("model_id", process.env.ELEVENLABS_STT_MODEL_ID?.trim() || "scribe_v2");
  const ext = path.extname(audioPath).toLowerCase();

  const mimeType =
    ext === ".wav"
      ? "audio/wav"
      : ext === ".m4a"
        ? "audio/mp4"
        : ext === ".aac"
          ? "audio/aac"
          : "audio/mpeg";

  form.append("file", new Blob([audioBuffer], { type: mimeType }), path.basename(audioPath));

  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs STT failed: ${response.status} ${response.statusText}${
        details ? ` - ${details}` : ""
      }`,
    );
  }

  const data = (await response.json()) as ElevenLabsScribeResponse;

  const words: WhisperWord[] = (data.words ?? [])
    .filter((word) => !word.type || word.type === "word")
    .map((word) => ({
      word: normalizeText(word.text ?? ""),
      start: Number(word.start),
      end: Number(word.end),
    }))
    .filter(
      (word) =>
        word.word &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.end > word.start,
    );

  if (!words.length) {
    return {
      clipIndex,
      chunks: [],
    };
  }

  const chunks = chunkWords(words)
    .map(wordsToDraftChunk)
    .filter((chunk): chunk is CaptionDraftChunk => !!chunk);

  return {
    clipIndex,
    chunks,
  };
}

function secondsToAssTime(sec: number): string {
  const totalCs = Math.max(0, Math.round(sec * 100));

  const hours = Math.floor(totalCs / 360000);
  const minutes = Math.floor((totalCs % 360000) / 6000);
  const seconds = Math.floor((totalCs % 6000) / 100);
  const centiseconds = totalCs % 100;

  const pad2 = (n: number) => n.toString().padStart(2, "0");

  return `${hours}:${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}`;
}

function synthesizeDraftWordsFromChunkText(chunk: CaptionDraftChunk): CaptionDraftWord[] {
  const raw = normalizeText(chunk.text || "");
  if (!raw) return [];

  const tokens = raw.split(" ").filter(Boolean);
  if (!tokens.length) return [];

  const totalDur = Math.max(chunk.endSec - chunk.startSec, 0.2);
  const perWord = totalDur / tokens.length;

  return tokens.map((token, index) => {
    const startSec = chunk.startSec + index * perWord;
    const endSec =
      index === tokens.length - 1 ? chunk.endSec : chunk.startSec + (index + 1) * perWord;

    return {
      text: token,
      startSec,
      endSec,
    };
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeText(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

function safeAssText(raw: string): string {
  return (raw ?? "").replace(/\r?\n/g, "\\N").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeWordKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, "")
    .trim();
}

function isPremiumKeyword(word: string, customKeywords?: string[]): boolean {
  const key = normalizeWordKey(word);
  if (!key) return false;

  if (customKeywords?.length) {
    return customKeywords.map((item) => normalizeWordKey(item)).includes(key);
  }

  return PREMIUM_HIGHLIGHT_WORDS.has(key);
}

function getValidWordsFromChunk(chunk: CaptionDraftChunk): CaptionDraftWord[] {
  const chunkText = normalizeText(chunk.text || "");

  const rawWords = Array.isArray(chunk.words) ? chunk.words : [];

  const validWords = rawWords
    .map((word) => ({
      text: normalizeText(word.text || ""),
      startSec: Number(word.startSec),
      endSec: Number(word.endSec),
    }))
    .filter(
      (word) =>
        !!word.text &&
        Number.isFinite(word.startSec) &&
        Number.isFinite(word.endSec) &&
        word.endSec > word.startSec,
    )
    .sort((a, b) => a.startSec - b.startSec);

  const wordsText = normalizeText(validWords.map((word) => word.text).join(" "));

  if (validWords.length && wordsText === chunkText) {
    return validWords;
  }

  return synthesizeDraftWordsFromChunkText({
    ...chunk,
    text: chunkText,
  });
}

function applyCaptionOffsetToDraft(draft: CaptionDraftClip, offsetSec: number): CaptionDraftClip {
  if (!Number.isFinite(offsetSec) || offsetSec === 0) return draft;

  const shift = (value: number) => Math.max(0, value + offsetSec);

  return {
    ...draft,
    chunks: draft.chunks.map((chunk) => ({
      ...chunk,
      startSec: shift(chunk.startSec),
      endSec: shift(chunk.endSec),
      words: chunk.words?.map((word) => ({
        ...word,
        startSec: shift(word.startSec),
        endSec: shift(word.endSec),
      })),
    })),
  };
}

function assColorForWord(word: string, customKeywords?: string[]): string {
  return isPremiumKeyword(word, customKeywords) ? PREMIUM_HIGHLIGHT_COLOR : PREMIUM_WHITE_COLOR;
}

function premiumWordTags(word: string, customKeywords?: string[]): string {
  const color = assColorForWord(word, customKeywords);

  return `{\\c${color}\\3c${PREMIUM_OUTLINE_COLOR}}`;
}

function resolveCaptionFontName(fontName: string): string {
  const cleanFontName = fontName.trim();
  if (!cleanFontName) return DEFAULT_FONT;

  return CAPTION_FONT_ALIASES[cleanFontName.toLowerCase()] ?? cleanFontName;
}

function buildAssHeader(
  style: CaptionStyle,
  fontName = DEFAULT_FONT,
  quoteReelCaptionPreset?: QuoteReelCaptionPreset,
): string {
  const styleLines = buildAssStyleLines(style, fontName, quoteReelCaptionPreset);

  return `[Script Info]
; Script generated by Hookify
ScriptType: v4.00+
PlayResX: ${PLAY_RES_X}
PlayResY: ${PLAY_RES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLines.join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

function buildAssStyleLines(
  style: CaptionStyle,
  fontName: string,
  quoteReelCaptionPreset?: QuoteReelCaptionPreset,
): string[] {
  const defaultStyle = buildDefaultStyleLine(style, fontName, quoteReelCaptionPreset);
  const centerStyle = buildCenterWordStyleLine(style, fontName, quoteReelCaptionPreset);
  return [defaultStyle, centerStyle];
}

function buildDefaultStyleLine(
  style: CaptionStyle,
  fontName: string,
  quoteReelCaptionPreset?: QuoteReelCaptionPreset,
): string {
  const base = {
    Name: "Default",
    Fontname: fontName,
    Fontsize: 56,
    PrimaryColour: "&H00FFFFFF&",
    SecondaryColour: "&H00FFFFFF&",
    OutlineColour: "&HAA000000&",
    BackColour: "&H00000000&",
    Bold: 1,
    Italic: 0,
    Underline: 0,
    StrikeOut: 0,
    ScaleX: 100,
    ScaleY: 100,
    Spacing: 0,
    Angle: 0,
    BorderStyle: 1,
    Outline: 4,
    Shadow: 2,
    Alignment: 2,
    MarginL: 80,
    MarginR: 80,
    MarginV: 285,
    Encoding: 1,
  };

  if (style === "subtle") {
    return (
      "Style: " +
      [
        base.Name,
        base.Fontname,
        52,
        "&H00FFFFFF&",
        "&H00FFFFFF&",
        "&H99000000&",
        "&H00000000&",
        0,
        0,
        0,
        0,
        base.ScaleX,
        base.ScaleY,
        0,
        0,
        1,
        3,
        2,
        2,
        base.MarginL,
        base.MarginR,
        380,
        base.Encoding,
      ].join(",")
    );
  }

  if (style === "boldYellow") {
    return (
      "Style: " +
      [
        base.Name,
        base.Fontname,
        64,
        "&H0000FFFF&",
        "&H00FFFFFF&",
        "&HEE000000&",
        "&H00000000&",
        1,
        0,
        0,
        0,
        base.ScaleX,
        base.ScaleY,
        0,
        0,
        1,
        7,
        4,
        2,
        base.MarginL,
        base.MarginR,
        380,
        base.Encoding,
      ].join(",")
    );
  }

  if (style === "wordByWord" || style === "progressiveWords") {
    return buildDefaultStyleLine("karaoke", fontName);
  }

  return (
    "Style: " +
    [
      "Default",
      fontName,
      quoteReelCaptionPreset === "card_bottom_karaoke" ||
        quoteReelCaptionPreset === "card_bottom_premium_karaoke"
        ? QUOTE_CARD_KARAOKE_FONT_SIZE
        : 74,
      "&H00FFFFFF&",
      "&H00FFD200&",
      "&HDD000000&",
      "&H00000000&",
      1,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1,
      4,
      2,
      2,
      80,
      80,
      380,
      1,
    ].join(",")
  );
}

function buildCenterWordStyleLine(
  style: CaptionStyle,
  fontName: string,
  quoteReelCaptionPreset?: QuoteReelCaptionPreset,
): string {
  const quoteCardFontSize =
    quoteReelCaptionPreset === "card_center_word_by_word" ||
      quoteReelCaptionPreset === "card_center_premium_word"
      ? QUOTE_CARD_WORD_BY_WORD_FONT_SIZE
      : quoteReelCaptionPreset === "card_center_progressive_words"
        ? QUOTE_CARD_PROGRESSIVE_FONT_SIZE
        : 86;

  if (style === "boldYellow") {
    return (
      "Style: " +
      [
        "QuoteCenterWord",
        fontName,
        88,
        "&H0000FFFF&",
        "&H00FFFFFF&",
        "&HEE000000&",
        "&H00000000&",
        1,
        0,
        0,
        0,
        100,
        100,
        0,
        0,
        1,
        7,
        4,
        5,
        40,
        40,
        40,
        1,
      ].join(",")
    );
  }

  if (style === "subtle") {
    return (
      "Style: " +
      [
        "QuoteCenterWord",
        fontName,
        76,
        "&H00FFFFFF&",
        "&H00FFFFFF&",
        "&HAA000000&",
        "&H00000000&",
        0,
        0,
        0,
        0,
        100,
        100,
        0,
        0,
        1,
        4,
        2,
        5,
        40,
        40,
        40,
        1,
      ].join(",")
    );
  }

  if (style === "wordByWord" || style === "progressiveWords") {
    return buildCenterWordStyleLine("karaoke", fontName);
  }

  return (
    "Style: " +
    [
      "QuoteCenterWord",
      fontName,
      quoteCardFontSize,
      "&H00FFFFFF&",
      "&H00FFD200&",
      "&HDD000000&",
      "&H00000000&",
      1,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1,
      5,
      3,
      5,
      40,
      40,
      40,
      1,
    ].join(",")
  );
}

function lineFade(): string {
  return `{\\fad(${LINE_FADE_IN_MS},${LINE_FADE_OUT_MS})}`;
}

async function runCmd(cmd: string, args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = "";

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(new Error(`[${logPrefix}] ${cmd} exited with ${code}\n${stderr}`));
      }
    });
  });
}

async function extractTinyAudioForWhisper(videoPath: string): Promise<string> {
  const AUDIO_DIR = path.join(process.cwd(), "tmp", "audio");
  await ensureDir(AUDIO_DIR);

  const outPath = path.join(AUDIO_DIR, `${randomUUID()}.mp3`);

  const args = [
    "-y",
    "-i",
    videoPath,
    "-map",
    "0:a:0?",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "24k",
    outPath,
  ];

  await runCmd("ffmpeg", args, "extractTinyAudioForWhisper");
  await fsp.access(outPath);

  const stat = await fsp.stat(outPath);

  if (stat.size < 1024) {
    throw new Error("No audio track or extracted audio too small for Whisper");
  }

  const MAX_BYTES = 24 * 1024 * 1024;

  if (stat.size > MAX_BYTES) {
    const outPath2 = path.join(AUDIO_DIR, `${randomUUID()}.mp3`);
    const args2 = [
      "-y",
      "-i",
      videoPath,
      "-map",
      "0:a:0?",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "16k",
      outPath2,
    ];

    await runCmd("ffmpeg", args2, "extractTinyAudioForWhisper_16k");
    await fsp.access(outPath2);
    await fsp.unlink(outPath).catch(() => {});
    return outPath2;
  }

  return outPath;
}

function synthesizeWordsFromSegment(seg: WhisperSegment): WhisperWord[] {
  const raw = normalizeText(seg.text || "");
  if (!raw) return [];

  const tokens = raw.split(" ").filter(Boolean);
  if (!tokens.length) return [];

  const totalDur = Math.max(seg.end - seg.start, 0.5);
  const perWord = totalDur / tokens.length;

  const words: WhisperWord[] = [];
  let cursor = seg.start;

  for (const token of tokens) {
    const start = cursor;
    const end = cursor + perWord;
    words.push({ word: token, start, end });
    cursor = end;
  }

  return words;
}

function chunkWords(words: WhisperWord[], chunkSize = CHUNK_SIZE): WhisperWord[][] {
  const chunks: WhisperWord[][] = [];

  const maxWords = Math.max(1, Math.min(6, chunkSize));

  const breakGapSec = Number.isFinite(CAPTION_CHUNK_BREAK_GAP_SEC)
    ? Math.max(0.08, CAPTION_CHUNK_BREAK_GAP_SEC)
    : 0.24;

  const maxChunkDurationSec = Number.isFinite(CAPTION_MAX_CHUNK_DURATION_SEC)
    ? Math.max(0.45, CAPTION_MAX_CHUNK_DURATION_SEC)
    : 1.15;

  let current: WhisperWord[] = [];

  for (const word of words) {
    const previous = current[current.length - 1];
    const first = current[0];

    const gapFromPrevious = previous ? word.start - previous.end : 0;
    const nextChunkDuration = first ? word.end - first.start : 0;

    const shouldStartNewChunk =
      current.length > 0 &&
      (current.length >= maxWords ||
        gapFromPrevious >= breakGapSec ||
        nextChunkDuration >= maxChunkDurationSec);

    if (shouldStartNewChunk) {
      chunks.push(current);
      current = [];
    }

    current.push(word);
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

function wordsToDraftChunk(words: WhisperWord[]): CaptionDraftChunk | null {
  if (!words.length) return null;

  const normalizedWords: CaptionDraftWord[] = words
    .map((w) => ({
      text: normalizeText(w.word || ""),
      startSec: w.start,
      endSec: w.end,
    }))
    .filter((w) => w.text);

  if (!normalizedWords.length) return null;

  return {
    id: randomUUID(),
    startSec: normalizedWords[0].startSec,
    endSec: normalizedWords[normalizedWords.length - 1].endSec,
    text: normalizedWords.map((w) => w.text).join(" "),
    words: normalizedWords,
  };
}

function buildDraftChunksFromSegment(seg: WhisperSegment): CaptionDraftChunk[] {
  const words = seg.words?.length ? seg.words : synthesizeWordsFromSegment(seg);
  if (!words.length) return [];

  return chunkWords(words)
    .map(wordsToDraftChunk)
    .filter((chunk): chunk is CaptionDraftChunk => !!chunk);
}

function buildKaraokeTextFromDraftChunk(
  chunk: CaptionDraftChunk,
  _customKeywords?: string[],
): string {
  const words = getValidWordsFromChunk(chunk);

  let assText = "";
  let cursorMs = 0;

  for (let index = 0; index < words.length; index += 1) {
    const w = words[index];
    const nextWord = words[index + 1];

    const rawWord = safeAssText(w.text || "");
    if (!rawWord) continue;

    const safeWordStartSec = Math.max(chunk.startSec, w.startSec);
    const safeWordEndSec = Math.max(safeWordStartSec + 0.04, w.endSec);

    // Important:
    // ASS karaoke is sequential.
    // To preserve natural pauses WITHOUT invisible tokens,
    // the current word "owns" the silence until the next word starts.
    const timingEndSec = nextWord ? Math.max(safeWordEndSec, nextWord.startSec) : safeWordEndSec;

    const durSec = Math.max(0.04, timingEndSec - safeWordStartSec);
    const durCs = Math.max(1, Math.round(durSec * 100));
    const durMs = durCs * 10;

    const wordStartMs = cursorMs;
    const wordEndMs = cursorMs + durMs;

    const popInEnd = Math.min(wordStartMs + KARAOKE_POP_IN_MS, wordEndMs);
    const popOutStart = Math.max(wordEndMs - KARAOKE_POP_OUT_MS, wordStartMs);
    const popScale = clamp(KARAOKE_POP_SCALE, 105, 140);

    if (assText) assText += " ";

    assText +=
      `{\\k${durCs}}` +
      `{\\t(${wordStartMs},${popInEnd},\\fscx${popScale}\\fscy${popScale})` +
      `\\t(${popOutStart},${wordEndMs},\\fscx100\\fscy100)}` +
      `${rawWord}` +
      `{\\fscx100\\fscy100}`;

    cursorMs += durMs;
  }

  return assText.trim();
}

function buildBottomCardKaraokeText(chunk: CaptionDraftChunk, customKeywords?: string[]): string {
  return (
    `{\\an2\\pos(${QUOTE_CARD_CENTER_X},${QUOTE_CARD_BOTTOM_TEXT_Y})}` +
    `{\\fad(30,70)}` +
    `{\\fsp0}` +
    buildKaraokeTextFromDraftChunk(chunk, customKeywords)
  );
}

function buildCenterWordByWordEvents(
  chunk: CaptionDraftChunk,
  captionStyle: CaptionStyle,
  customKeywords?: string[],
): Array<{ start: string; end: string; styleName: string; text: string }> {
  const words = getValidWordsFromChunk(chunk);

  return words
    .filter((w) => normalizeText(w.text))
    .map((w, index) => {
      const rawWord = safeAssText(w.text);
      const nextWord = words[index + 1];

      const startSec = w.startSec;
      const naturalEndSec = w.endSec;

      const maxEndBeforeNext = nextWord
        ? Math.max(startSec + 0.08, nextWord.startSec - 0.015)
        : naturalEndSec + 0.04;
      const endSec = Math.max(startSec + 0.08, Math.min(naturalEndSec + 0.045, maxEndBeforeNext));

      const durMs = Math.max(90, Math.round((endSec - startSec) * 1000));
      const popInEnd = Math.min(85, durMs);
      const popOutStart = Math.max(durMs - 75, 0);
      const popScale = clamp(KARAOKE_POP_SCALE, 108, 134);

      const colorTag = premiumWordTags(rawWord, customKeywords);

      const text =
        `{\\an5\\pos(${QUOTE_CARD_CENTER_X},${QUOTE_CARD_CENTER_Y})}` +
        `{\\fad(25,65)}` +
        colorTag +
        `{\\t(0,${popInEnd},\\fscx${popScale}\\fscy${popScale})` +
        `\\t(${popOutStart},${durMs},\\fscx100\\fscy100)}` +
        rawWord;

      return {
        start: secondsToAssTime(startSec),
        end: secondsToAssTime(endSec),
        styleName: "QuoteCenterWord",
        text,
      };
    });
}

function buildProgressiveWordsLineText(
  words: CaptionDraftWord[],
  currentIndex: number,
  customKeywords?: string[],
): string {
  const visibleWords = words.slice(0, currentIndex + 1);

  return visibleWords
    .map((word, index) => {
      const rawWord = safeAssText(word.text);
      if (!rawWord) return "";

      const isCurrentWord = index === currentIndex;
      const colorTag = premiumWordTags(rawWord, customKeywords);

      if (!isCurrentWord) {
        return `${colorTag}${rawWord}`;
      }

      return colorTag + `{\\fscx112\\fscy112}` + rawWord + `{\\fscx100\\fscy100}`;
    })
    .filter(Boolean)
    .join(" ");
}

function buildCenterProgressiveWordsEvents(
  chunk: CaptionDraftChunk,
  _captionStyle: CaptionStyle,
  customKeywords?: string[],
): Array<{ start: string; end: string; styleName: string; text: string }> {
  const words = getValidWordsFromChunk(chunk).filter((w) => normalizeText(w.text));

  if (!words.length) return [];

  return words.map((word, index) => {
    const nextWord = words[index + 1];

    const startSec = Math.max(chunk.startSec, word.startSec);

    const endSec = nextWord
      ? Math.max(startSec + 0.08, nextWord.startSec - 0.012)
      : Math.max(startSec + 0.12, word.endSec + 0.12);

    const durMs = Math.max(100, Math.round((endSec - startSec) * 1000));
    const popInEnd = Math.min(90, durMs);
    const popScale = 108;

    const lineText = buildProgressiveWordsLineText(words, index, customKeywords);

    const text =
      `{\\an5\\pos(${QUOTE_CARD_CENTER_X},${QUOTE_CARD_CENTER_Y})}` +
      `{\\fad(20,55)}` +
      `{\\t(0,${popInEnd},\\fscx${popScale}\\fscy${popScale})` +
      `\\t(${popInEnd},${durMs},\\fscx100\\fscy100)}` +
      lineText;

    return {
      start: secondsToAssTime(startSec),
      end: secondsToAssTime(endSec),
      styleName: "QuoteCenterWord",
      text,
    };
  });
}

function buildBottomWordByWordEvents(
  chunk: CaptionDraftChunk,
  customKeywords?: string[],
): Array<{ start: string; end: string; styleName: string; text: string }> {
  const words = getValidWordsFromChunk(chunk).filter((w) => normalizeText(w.text));

  return words.map((word, index) => {
    const rawWord = safeAssText(word.text);
    const nextWord = words[index + 1];
    const startSec = Math.max(chunk.startSec, word.startSec);
    const naturalEndSec = Math.max(startSec + 0.08, word.endSec);
    const maxEndBeforeNext = nextWord
      ? Math.max(startSec + 0.08, nextWord.startSec - 0.015)
      : naturalEndSec + 0.1;
    const endSec = Math.max(startSec + 0.08, Math.min(naturalEndSec + 0.06, maxEndBeforeNext));
    const durMs = Math.max(90, Math.round((endSec - startSec) * 1000));
    const popInEnd = Math.min(85, durMs);
    const popOutStart = Math.max(durMs - 75, 0);
    const popScale = clamp(KARAOKE_POP_SCALE, 108, 134);

    const text =
      lineFade() +
      premiumWordTags(rawWord, customKeywords) +
      `{\\t(0,${popInEnd},\\fscx${popScale}\\fscy${popScale})` +
      `\\t(${popOutStart},${durMs},\\fscx100\\fscy100)}` +
      rawWord;

    return {
      start: secondsToAssTime(startSec),
      end: secondsToAssTime(endSec),
      styleName: "Default",
      text,
    };
  });
}

function buildBottomProgressiveWordsEvents(
  chunk: CaptionDraftChunk,
  customKeywords?: string[],
): Array<{ start: string; end: string; styleName: string; text: string }> {
  const words = getValidWordsFromChunk(chunk).filter((w) => normalizeText(w.text));

  if (!words.length) return [];

  return words.map((word, index) => {
    const nextWord = words[index + 1];
    const startSec = Math.max(chunk.startSec, word.startSec);
    const endSec = nextWord
      ? Math.max(startSec + 0.08, nextWord.startSec - 0.012)
      : Math.max(startSec + 0.12, word.endSec + 0.12);
    const durMs = Math.max(100, Math.round((endSec - startSec) * 1000));
    const popInEnd = Math.min(90, durMs);
    const popScale = 108;
    const lineText = buildProgressiveWordsLineText(words, index, customKeywords);

    const text =
      lineFade() +
      `{\\t(0,${popInEnd},\\fscx${popScale}\\fscy${popScale})` +
      `\\t(${popInEnd},${durMs},\\fscx100\\fscy100)}` +
      lineText;

    return {
      start: secondsToAssTime(startSec),
      end: secondsToAssTime(endSec),
      styleName: "Default",
      text,
    };
  });
}

function applyInlineStyle(text: string, style: CaptionStyle) {
  if (style === "boldYellow") {
    return `{\\b1\\bord7\\shad4\\c&H0000FFFF&}${text}`;
  }

  if (style === "subtle") {
    return `{\\b0\\bord3\\shad2\\c&H00FFFFFF&}${text}`;
  }

  return text;
}

function buildDefaultDialogueTextFromDraftChunk(
  chunk: CaptionDraftChunk,
  captionStyle: CaptionStyle,
  customKeywords?: string[],
): string {
  if (captionStyle === "karaoke") {
    return `${lineFade()}${buildKaraokeTextFromDraftChunk(chunk, customKeywords)}`;
  }

  return `${lineFade()}${applyInlineStyle(safeAssText(chunk.text), captionStyle)}`;
}

async function transcribeAudioPathToDraft(
  audioPath: string,
  clipIndex: number,
  cleanupAudioAfter = false,
): Promise<CaptionDraftClip> {
  try {
    const resp = (await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioPath),
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    })) as unknown as WhisperVerboseResponse;

    if (!resp.segments || resp.segments.length === 0) {
      return {
        clipIndex,
        chunks: [],
      };
    }

    const chunks = resp.segments.flatMap((seg) => buildDraftChunksFromSegment(seg));

    return {
      clipIndex,
      chunks,
    };
  } finally {
    if (cleanupAudioAfter) {
      await fsp.unlink(audioPath).catch(() => {});
    }
  }
}

async function transcribeClipToDraft(
  clipPath: string,
  clipIndex: number,
): Promise<CaptionDraftClip> {
  const audioPath = await extractTinyAudioForWhisper(clipPath);

  try {
    if (process.env.ELEVENLABS_API_KEY?.trim()) {
      try {
        return await transcribeAudioPathToDraftWithElevenLabs(audioPath, clipIndex);
      } catch (err) {
        console.warn(
          "[transcribeClipToDraft] ElevenLabs STT failed, falling back to Whisper:",
          err,
        );
      }
    }

    return await transcribeAudioPathToDraft(audioPath, clipIndex, false);
  } finally {
    await fsp.unlink(audioPath).catch(() => {});
  }
}

function draftClipToAss(
  draftClip: CaptionDraftClip,
  captionStyle: CaptionStyle,
  fontName: string,
  quoteReelCaptionPreset?: QuoteReelCaptionPreset,
  customKeywords?: string[],
): string {
  let ass = buildAssHeader(captionStyle, fontName, quoteReelCaptionPreset);

  for (const chunk of draftClip.chunks) {
    if (!quoteReelCaptionPreset && captionStyle === "wordByWord") {
      for (const event of buildBottomWordByWordEvents(chunk, customKeywords)) {
        const dialogue = [
          "Dialogue: 0",
          event.start,
          event.end,
          event.styleName,
          "",
          "0",
          "0",
          "0",
          "",
          event.text,
        ].join(",");

        ass += dialogue + "\n";
      }

      continue;
    }

    if (!quoteReelCaptionPreset && captionStyle === "progressiveWords") {
      for (const event of buildBottomProgressiveWordsEvents(chunk, customKeywords)) {
        const dialogue = [
          "Dialogue: 0",
          event.start,
          event.end,
          event.styleName,
          "",
          "0",
          "0",
          "0",
          "",
          event.text,
        ].join(",");

        ass += dialogue + "\n";
      }

      continue;
    }

    if (
      quoteReelCaptionPreset === "card_center_word_by_word" ||
      quoteReelCaptionPreset === "card_center_progressive_words" ||
      quoteReelCaptionPreset === "card_center_premium_word"
    ) {
      const events =
        quoteReelCaptionPreset === "card_center_progressive_words"
          ? buildCenterProgressiveWordsEvents(chunk, captionStyle, customKeywords)
          : buildCenterWordByWordEvents(chunk, captionStyle, customKeywords);

      for (const event of events) {
        const dialogue = [
          "Dialogue: 0",
          event.start,
          event.end,
          event.styleName,
          "",
          "0",
          "0",
          "0",
          "",
          event.text,
        ].join(",");

        ass += dialogue + "\n";
      }

      continue;
    }

    const start = secondsToAssTime(chunk.startSec);
    const end = secondsToAssTime(chunk.endSec);

    const text =
      quoteReelCaptionPreset === "card_bottom_karaoke" ||
      quoteReelCaptionPreset === "card_bottom_premium_karaoke"
        ? buildBottomCardKaraokeText(chunk, customKeywords)
        : buildDefaultDialogueTextFromDraftChunk(chunk, captionStyle, customKeywords);

    const dialogue = ["Dialogue: 0", start, end, "Default", "", "0", "0", "0", "", text].join(",");

    ass += dialogue + "\n";
  }

  return ass;
}

export async function generateCaptionDraftsForClips(clips: string[]): Promise<CaptionDraftClip[]> {
  await ensureDir(SUBS_DIR);

  const drafts: CaptionDraftClip[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clipPath = clips[i];

    try {
      const draft = await transcribeClipToDraft(clipPath, i);
      drafts.push(draft);
    } catch (err) {
      console.error("[generateCaptionDraftsForClips] Failed for clip:", clipPath, err);

      drafts.push({
        clipIndex: i,
        chunks: [],
      });
    }
  }

  return drafts;
}

export async function generateCaptionDraftsForAudioFiles(
  audioFiles: string[],
): Promise<CaptionDraftClip[]> {
  await ensureDir(SUBS_DIR);

  const drafts: CaptionDraftClip[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const audioPath = audioFiles[i];

    try {
      const draft = await transcribeAudioPathToDraft(audioPath, i, false);
      drafts.push(draft);
    } catch (err) {
      console.error("[generateCaptionDraftsForAudioFiles] Failed for audio:", audioPath, err);

      drafts.push({
        clipIndex: i,
        chunks: [],
      });
    }
  }

  return drafts;
}

export async function generateSubtitlesFromDrafts(
  drafts: CaptionDraftClip[],
  clips: string[],
  options?: SubtitleGenerationOptions,
): Promise<string[]> {
  await ensureDir(SUBS_DIR);

  const captionStyle = options?.captionStyle ?? "karaoke";
  const fontName = resolveCaptionFontName(options?.fontName ?? PREMIUM_FONT);
  const quoteReelCaptionPreset = options?.quoteReelCaptionPreset;
  const captionOffsetSec = Number.isFinite(options?.captionOffsetSec)
    ? Number(options?.captionOffsetSec)
    : DEFAULT_CAPTION_OFFSET_SEC;
  const premiumKeywords = options?.premiumKeywords;

  const subtitleFiles: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clipPath = clips[i];
    const base = path.basename(clipPath, path.extname(clipPath));
    const assPath = path.join(SUBS_DIR, `${base}.ass`);

    const rawDraft = drafts.find((d) => d.clipIndex === i) ?? {
      clipIndex: i,
      chunks: [],
    };

    const draft = applyCaptionOffsetToDraft(rawDraft, captionOffsetSec);

    const ass = draftClipToAss(
      draft,
      captionStyle,
      fontName,
      quoteReelCaptionPreset,
      premiumKeywords,
    );

    await fsp.writeFile(assPath, ass, "utf8");
    subtitleFiles.push(assPath);
  }

  return subtitleFiles;
}

export async function generateSubtitlesForClips(
  clips: string[],
  options?: SubtitleGenerationOptions,
): Promise<string[]> {
  const drafts = await generateCaptionDraftsForClips(clips);
  return generateSubtitlesFromDrafts(drafts, clips, options);
}
