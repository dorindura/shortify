// src/server/ai/elevenLabsVoiceover.ts
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { QuoteReelTone } from "@lib/jobsStore";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const TTS_DIR = path.join(process.cwd(), "tmp", "tts");

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

export type GenerateVoiceoverResult = {
  audioPath: string;
  durationSec: number;
  voicePreset: QuoteReelVoicePreset;
  voiceId: string;
  modelId: string;
  outputFormat: string;
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

function getEnvNumber(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
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
      else reject(new Error(`[${logPrefix}] ${cmd} exited with ${code}\n${stderr}`));
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

  // Prefer v3 for shorter, more expressive scripts.
  // Fallback to multilingual_v2 for longer scripts.
  if (explicit) return explicit;

  return countChars(text) <= 4800 ? "eleven_v3" : "eleven_multilingual_v2";
}

function buildVoiceSettings(preset: QuoteReelVoicePreset, tone?: QuoteReelTone, modelId?: string) {
  const isV3 = modelId === "eleven_v3";

  let stability = getEnvNumber("ELEVENLABS_STABILITY", 0.3);
  let similarityBoost = getEnvNumber("ELEVENLABS_SIMILARITY", 0.85);
  let style = getEnvNumber("ELEVENLABS_STYLE", 0.35);

  if (preset === "motivational_male") {
    stability = 0.22;
    similarityBoost = 0.8;
    style = 0.55;
  } else if (preset === "dark_male") {
    stability = 0.28;
    similarityBoost = 0.84;
    style = 0.48;
  } else if (preset === "storyteller") {
    stability = 0.3;
    similarityBoost = 0.82;
    style = 0.52;
  } else if (preset === "soft_female") {
    stability = 0.38;
    similarityBoost = 0.8;
    style = 0.42;
  } else if (preset === "neutral") {
    stability = 0.35;
    similarityBoost = 0.85;
    style = 0.3;
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

  // Keep settings safe. v3 is expressive already, so don't overpush.
  return {
    stability: clamp(stability, 0, 1),
    similarity_boost: clamp(similarityBoost, 0, 1),
    style: clamp(isV3 ? Math.min(style, 0.6) : style, 0, 1),
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

  if (tone === "dark") {
    return `[calm] ${clean}`;
  }

  if (tone === "aggressive") {
    return `[intense] ${clean}`;
  }

  if (tone === "emotional") {
    return `[gentle] ${clean}`;
  }

  if (tone === "cinematic") {
    return `[dramatic] ${clean}`;
  }

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
    `ElevenLabs request failed: ${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`,
  );
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

  const url = new URL(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: requestText,
      model_id: modelId,
      voice_settings: buildVoiceSettings(voicePreset, input.tone, modelId),
    }),
  });

  await ensureResponseOk(response);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error("ElevenLabs returned empty audio buffer");
  }

  await fs.writeFile(audioPath, buffer);

  const durationSec = await probeAudioDuration(audioPath);

  return {
    audioPath,
    durationSec,
    voicePreset,
    voiceId,
    modelId,
    outputFormat,
  };
}
