// src/server/ai/elevenLabsVoiceover.ts
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { CaptionDraftClip, QuoteReelTone } from "@lib/jobsStore";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const TTS_DIR = path.join(process.cwd(), "tmp", "tts");

const CAPTION_MAX_WORDS_PER_CHUNK = Number(process.env.QUOTE_REEL_CAPTION_MAX_WORDS_PER_CHUNK ?? 4);

const CAPTION_CHUNK_BREAK_GAP_SEC = Number(
  process.env.QUOTE_REEL_CAPTION_CHUNK_BREAK_GAP_SEC ?? 0.24,
);

const CAPTION_MAX_CHUNK_DURATION_SEC = Number(
  process.env.QUOTE_REEL_CAPTION_MAX_CHUNK_DURATION_SEC ?? 1.15,
);
export type QuoteReelVoicePreset =
  | "dark_male"
  | "storyteller"
  | "soft_female"
  | "motivational_male"
  | "neutral";

type GenerateVoiceoverInput = {
  text: string;
  tone?: QuoteReelTone;
  voicePreset?: QuoteReelVoicePreset;
};

type ElevenLabsAlignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type ElevenLabsWithTimestampsResponse = {
  audio_base64?: string;
  alignment?: ElevenLabsAlignment;
  normalized_alignment?: ElevenLabsAlignment;
};

export type GenerateVoiceoverResult = {
  audioPath: string;
  durationSec: number;
  voicePreset: QuoteReelVoicePreset;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  captionDraft?: CaptionDraftClip;
};

type FitVoiceoverToDurationInput = {
  audioPath: string;
  durationSec: number;
  maxDurationSec: number;
  captionDraft?: CaptionDraftClip;
};

type WordTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function getOptionalEnvNumber(name: string) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : undefined;
}

function resolveVoiceSpeed(preset: QuoteReelVoicePreset, tone?: QuoteReelTone) {
  const envSpeed = getOptionalEnvNumber("ELEVENLABS_SPEED");
  if (envSpeed != null) return clamp(envSpeed, 0.85, 1);

  let speed = 0.92;

  if (preset === "motivational_male") {
    speed = 0.95;
  } else if (preset === "dark_male") {
    speed = 0.9;
  } else if (preset === "storyteller") {
    speed = 0.91;
  } else if (preset === "soft_female") {
    speed = 0.9;
  } else if (preset === "neutral") {
    speed = 0.93;
  }

  if (tone === "aggressive") speed += 0.03;
  if (tone === "calm") speed -= 0.03;
  if (tone === "emotional") speed -= 0.07;
  if (tone === "stoic") speed -= 0.02;

  return clamp(speed, 0.85, 1);
}

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) resolve((stdout || stderr).trim());
      else {
        reject(new Error(`[${logPrefix}] ${cmd} exited with ${code}\n${stderr}`));
      }
    });
  });
}

export async function probeAudioDuration(audioPath: string): Promise<number> {
  const output = await runCmd(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    "probeAudioDuration",
  );

  const value = Number.parseFloat(output.trim());

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Could not determine audio duration for: ${audioPath}`);
  }

  return value;
}

function countChars(text: string) {
  return text.length;
}

function resolveDefaultPreset(
  preset?: QuoteReelVoicePreset,
  tone?: QuoteReelTone,
): QuoteReelVoicePreset {
  if (
    preset === "dark_male" ||
    preset === "storyteller" ||
    preset === "soft_female" ||
    preset === "motivational_male" ||
    preset === "neutral"
  ) {
    return preset;
  }

  if (tone === "dark" || tone === "stoic") return "dark_male";
  if (tone === "emotional" || tone === "calm") return "soft_female";
  if (tone === "aggressive") return "motivational_male";
  if (tone === "cinematic") return "storyteller";
  return "neutral";
}

function resolveVoiceIdFromPreset(preset: QuoteReelVoicePreset): string {
  const darkMale = process.env.ELEVENLABS_VOICE_DARK_MALE?.trim();
  const storyteller = process.env.ELEVENLABS_VOICE_STORYTELLER?.trim();
  const softFemale = process.env.ELEVENLABS_VOICE_SOFT_FEMALE?.trim();
  const motivationalMale = process.env.ELEVENLABS_VOICE_MOTIVATIONAL_MALE?.trim();
  const neutral = process.env.ELEVENLABS_VOICE_NEUTRAL?.trim();

  const fallbackDeepMale = process.env.ELEVENLABS_VOICE_DEEP_MALE?.trim();
  const fallbackFemale = process.env.ELEVENLABS_VOICE_FEMALE?.trim();

  const byPreset: Record<QuoteReelVoicePreset, string | undefined> = {
    dark_male: darkMale || fallbackDeepMale,
    storyteller: storyteller || fallbackDeepMale || neutral,
    soft_female: softFemale || fallbackFemale,
    motivational_male: motivationalMale || fallbackDeepMale,
    neutral: neutral || fallbackDeepMale,
  };

  const voiceId = byPreset[preset];

  if (!voiceId) {
    throw new Error(`Missing ElevenLabs voice id for preset: ${preset}`);
  }

  return voiceId;
}

function resolveModelId(text: string): string {
  const explicit = process.env.ELEVENLABS_MODEL_ID?.trim();
  if (explicit) return explicit;

  return countChars(text) <= 4800 ? "eleven_v3" : "eleven_multilingual_v2";
}

function buildVoiceSettings(preset: QuoteReelVoicePreset, tone?: QuoteReelTone, modelId?: string) {
  const isV3 = modelId === "eleven_v3";

  let stability = 0.5;
  let similarityBoost = 0.8;
  let style = 0.24;
  const speed = resolveVoiceSpeed(preset, tone);

  if (preset === "motivational_male") {
    stability = 0.42;
    similarityBoost = 0.8;
    style = 0.34;
  } else if (preset === "dark_male") {
    stability = 0.5;
    similarityBoost = 0.8;
    style = 0.28;
  } else if (preset === "storyteller") {
    stability = 0.48;
    similarityBoost = 0.78;
    style = 0.32;
  } else if (preset === "soft_female") {
    stability = 0.56;
    similarityBoost = 0.78;
    style = 0.22;
  } else if (preset === "neutral") {
    stability = 0.52;
    similarityBoost = 0.82;
    style = 0.2;
  }

  if (tone === "aggressive") {
    stability -= 0.04;
    style += 0.06;
  }

  if (tone === "calm") {
    stability += 0.06;
    style -= 0.05;
  }

  if (tone === "emotional") {
    style += 0.06;
    similarityBoost -= 0.03;
  }

  if (tone === "stoic") {
    stability += 0.05;
    style -= 0.02;
  }

  stability = getOptionalEnvNumber("ELEVENLABS_STABILITY") ?? stability;
  similarityBoost = getOptionalEnvNumber("ELEVENLABS_SIMILARITY") ?? similarityBoost;
  style = getOptionalEnvNumber("ELEVENLABS_STYLE") ?? style;

  return {
    stability: clamp(stability, 0, 1),
    similarity_boost: clamp(similarityBoost, 0, 1),
    style: clamp(isV3 ? Math.min(style, 0.6) : style, 0, 1),
    speed,
    use_speaker_boost: true,
  };
}

function maybeAddExpressiveDirectingTags(
  text: string,
  tone?: QuoteReelTone,
  modelId?: string,
): string {
  if (modelId !== "eleven_v3") return text;

  const clean = normalizeWhitespace(text);

  if (tone === "dark") return `[calm] ${clean}`;
  if (tone === "aggressive") return `[intense] ${clean}`;
  if (tone === "emotional") return `[gentle] ${clean}`;
  if (tone === "cinematic") return `[dramatic] ${clean}`;

  return clean;
}

async function ensureResponseOk(response: Response): Promise<void> {
  if (response.ok) return;

  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }

  throw new Error(
    `ElevenLabs request failed: ${response.status} ${response.statusText}${
      details ? ` - ${details}` : ""
    }`,
  );
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}'’-]/u.test(char);
}

function buildWordTimingsFromAlignment(alignment?: ElevenLabsAlignment): WordTiming[] {
  const characters = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];

  if (!characters.length || !starts.length || !ends.length) return [];

  const words: WordTiming[] = [];

  let currentText = "";
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  const flush = () => {
    const text = normalizeWhitespace(currentText);
    if (
      text &&
      currentStart != null &&
      currentEnd != null &&
      Number.isFinite(currentStart) &&
      Number.isFinite(currentEnd) &&
      currentEnd > currentStart
    ) {
      words.push({
        text,
        startSec: currentStart,
        endSec: currentEnd,
      });
    }

    currentText = "";
    currentStart = null;
    currentEnd = null;
  };

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i] ?? "";
    const startSec = Number(starts[i]);
    const endSec = Number(ends[i]);

    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      continue;
    }

    if (isWordChar(char)) {
      if (currentStart == null) currentStart = startSec;
      currentText += char;
      currentEnd = Math.max(endSec, currentEnd ?? endSec);
    } else {
      flush();
    }
  }

  flush();

  return words;
}

function groupWordsIntoCaptionChunks(words: WordTiming[]): WordTiming[][] {
  const maxWords = Number.isFinite(CAPTION_MAX_WORDS_PER_CHUNK)
    ? Math.max(1, Math.min(6, CAPTION_MAX_WORDS_PER_CHUNK))
    : 4;

  const breakGapSec = Number.isFinite(CAPTION_CHUNK_BREAK_GAP_SEC)
    ? Math.max(0.08, CAPTION_CHUNK_BREAK_GAP_SEC)
    : 0.24;

  const maxChunkDurationSec = Number.isFinite(CAPTION_MAX_CHUNK_DURATION_SEC)
    ? Math.max(0.45, CAPTION_MAX_CHUNK_DURATION_SEC)
    : 1.15;

  const groups: WordTiming[][] = [];
  let current: WordTiming[] = [];

  for (const word of words) {
    const previous = current[current.length - 1];
    const first = current[0];

    const gapFromPrevious = previous ? word.startSec - previous.endSec : 0;
    const nextChunkDuration = first ? word.endSec - first.startSec : 0;

    const shouldStartNewGroup =
      current.length > 0 &&
      (current.length >= maxWords ||
        gapFromPrevious >= breakGapSec ||
        nextChunkDuration >= maxChunkDurationSec);

    if (shouldStartNewGroup) {
      groups.push(current);
      current = [];
    }

    current.push(word);
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

function buildCaptionDraftFromWordTimings(words: WordTiming[]): CaptionDraftClip | undefined {
  const cleanWords = words
    .map((word) => ({
      text: normalizeWhitespace(word.text),
      startSec: Number(word.startSec),
      endSec: Number(word.endSec),
    }))
    .filter(
      (word) =>
        word.text &&
        Number.isFinite(word.startSec) &&
        Number.isFinite(word.endSec) &&
        word.endSec > word.startSec,
    )
    .sort((a, b) => a.startSec - b.startSec);

  if (!cleanWords.length) return undefined;

  const groupedWords = groupWordsIntoCaptionChunks(cleanWords);

  const chunks: CaptionDraftClip["chunks"] = groupedWords
    .filter((group) => group.length > 0)
    .map((group) => ({
      id: randomUUID(),
      startSec: group[0].startSec,
      endSec: group[group.length - 1].endSec,
      text: group.map((word) => word.text).join(" "),
      words: group,
    }));

  if (!chunks.length) return undefined;

  return {
    clipIndex: 0,
    chunks,
  };
}

function buildAtempoFilter(speedFactor: number): string {
  const filters: string[] = [];
  let remaining = speedFactor;

  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  filters.push(`atempo=${clamp(remaining, 0.5, 2).toFixed(6)}`);

  return filters.join(",");
}

function scaleCaptionDraftTiming(
  draft: CaptionDraftClip | undefined,
  scale: number,
): CaptionDraftClip | undefined {
  if (!draft || !Number.isFinite(scale) || scale <= 0) return draft;

  return {
    ...draft,
    chunks: draft.chunks.map((chunk) => ({
      ...chunk,
      startSec: chunk.startSec * scale,
      endSec: chunk.endSec * scale,
      words: chunk.words?.map((word) => ({
        ...word,
        startSec: word.startSec * scale,
        endSec: word.endSec * scale,
      })),
    })),
  };
}

export async function fitVoiceoverToMaxDuration(input: FitVoiceoverToDurationInput): Promise<{
  audioPath: string;
  durationSec: number;
  captionDraft?: CaptionDraftClip;
  wasAdjusted: boolean;
}> {
  const maxDurationSec = Number(input.maxDurationSec);
  const durationSec = Number(input.durationSec);

  if (
    !Number.isFinite(maxDurationSec) ||
    maxDurationSec <= 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= maxDurationSec
  ) {
    return {
      audioPath: input.audioPath,
      durationSec: input.durationSec,
      captionDraft: input.captionDraft,
      wasAdjusted: false,
    };
  }

  await ensureDir(TTS_DIR);

  const outputPath = path.join(TTS_DIR, `${randomUUID()}-fit.mp3`);
  const speedFactor = durationSec / maxDurationSec;

  await runCmd(
    "ffmpeg",
    [
      "-y",
      "-i",
      input.audioPath,
      "-filter:a",
      buildAtempoFilter(speedFactor),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ],
    "fitVoiceoverToMaxDuration",
  );

  const fittedDurationSec = await probeAudioDuration(outputPath);
  const timingScale = fittedDurationSec / durationSec;

  return {
    audioPath: outputPath,
    durationSec: fittedDurationSec,
    captionDraft: scaleCaptionDraftTiming(input.captionDraft, timingScale),
    wasAdjusted: true,
  };
}

export async function generateVoiceoverFromText(
  input: GenerateVoiceoverInput,
): Promise<GenerateVoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  const normalizedText = normalizeWhitespace(input.text || "");
  if (!normalizedText) {
    throw new Error("Cannot generate voice-over from empty text");
  }

  const voicePreset = resolveDefaultPreset(input.voicePreset, input.tone);
  const voiceId = resolveVoiceIdFromPreset(voicePreset);
  const modelId = resolveModelId(normalizedText);
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || "mp3_44100_128";

  await ensureDir(TTS_DIR);

  const audioPath = path.join(TTS_DIR, `${randomUUID()}.mp3`);
  const requestText = maybeAddExpressiveDirectingTags(normalizedText, input.tone, modelId);

  const url = new URL(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/with-timestamps`);
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: requestText,
      model_id: modelId,
      voice_settings: buildVoiceSettings(voicePreset, input.tone, modelId),
    }),
  });

  await ensureResponseOk(response);

  const data = (await response.json()) as ElevenLabsWithTimestampsResponse;

  if (!data.audio_base64) {
    throw new Error("ElevenLabs returned no audio_base64");
  }

  const buffer = Buffer.from(data.audio_base64, "base64");

  if (!buffer.length) {
    throw new Error("ElevenLabs returned empty audio buffer");
  }

  await fs.writeFile(audioPath, buffer);

  const durationSec = await probeAudioDuration(audioPath);

  const alignment = data.normalized_alignment ?? data.alignment;
  const wordTimings = buildWordTimingsFromAlignment(alignment);
  const captionDraft = buildCaptionDraftFromWordTimings(wordTimings);

  return {
    audioPath,
    durationSec,
    voicePreset,
    voiceId,
    modelId,
    outputFormat,
    captionDraft,
  };
}
