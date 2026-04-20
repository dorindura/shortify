// src/server/video/quoteReelAssembly.ts
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { JobAspect, QuoteReelAssetPick, QuoteReelSegment } from "@lib/jobsStore";

const TMP_ROOT = path.join(process.cwd(), "tmp", "quote-reel-assembly");
const ffThreads = String(process.env.FFMPEG_THREADS ?? "1");

// Final canvas stays vertical
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Inner cinematic video card (smaller, centered)
const CARD_W = 900;
const CARD_H = 1600;

// Soft shadow offset
const SHADOW_X = 8;
const SHADOW_Y = 14;

type PreparedSegment = {
  segmentId: string;
  text: string;
  assetPath: string;
  preparedPath: string;
  durationSec: number;
};

export type AssembleQuoteReelInput = {
  aspect?: JobAspect;
  segments: QuoteReelSegment[];
  assetPicks: QuoteReelAssetPick[];
  voiceoverAudioPath?: string;
  targetDurationSec?: number;
};

export type AssembleQuoteReelResult = {
  draftVideoPath: string;
  finalVideoPath: string;
  thumbPath: string;
  cleanupPaths: string[];
  preparedSegments: PreparedSegment[];
  actualDurationSec: number;
};

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ${cmd} ${args.join(" ")}`);

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
      if (code === 0) {
        resolve((stdout || stderr).trim());
      } else {
        reject(new Error(`[${logPrefix}] ${cmd} exited with ${code}\n${stderr}`));
      }
    });
  });
}

async function probeDuration(mediaPath: string): Promise<number> {
  const output = await runCmd(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mediaPath,
    ],
    "quoteReelAssembly:probeDuration",
  );

  const secs = Number.parseFloat(output.trim());
  if (!Number.isFinite(secs) || secs <= 0) {
    throw new Error(`Could not determine duration for media: ${mediaPath}`);
  }

  return secs;
}

function getCardVideoBaseFilters(aspect: JobAspect): string[] {
  if (aspect === "horizontal") {
    return [
      `scale=${CARD_W}:${CARD_H}:force_original_aspect_ratio=decrease:flags=bicubic`,
      `pad=${CARD_W}:${CARD_H}:(ow-iw)/2:(oh-ih)/2:black`,
      "fps=30",
      "format=yuv420p",
    ];
  }

  if (aspect === "verticalLetterbox") {
    return [
      `scale=${CARD_W}:${CARD_H}:force_original_aspect_ratio=decrease:flags=bicubic`,
      `pad=${CARD_W}:${CARD_H}:(ow-iw)/2:(oh-ih)/2:black`,
      "fps=30",
      "format=yuv420p",
    ];
  }

  // Main desired look for quote reel:
  // keep a vertical crop, but not fullscreen; it sits inside a centered card
  return [
    `scale=${CARD_W}:${CARD_H}:force_original_aspect_ratio=increase:flags=bicubic`,
    `crop=${CARD_W}:${CARD_H}`,
    "fps=30",
    "format=yuv420p",
  ];
}

function getSegmentTargetDurations(
  segments: QuoteReelSegment[],
  targetDurationSec: number,
): number[] {
  const normalizedTarget = clamp(targetDurationSec || 70, 30, 240);

  const weights = segments.map((segment) => {
    const words = normalizeWhitespace(segment.voiceoverText || segment.text)
      .split(" ")
      .filter(Boolean).length;

    let weight = Math.max(words, 3);

    if (segment.type === "hook") weight += 2;
    if (segment.type === "payoff") weight += 1;
    if (segment.type === "cta") weight = Math.max(weight - 1, 3);

    return weight;
  });

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || segments.length;
  const raw = weights.map((weight) => (normalizedTarget * weight) / totalWeight);

  const clamped = raw.map((value, index) => {
    const segment = segments[index];
    const words = normalizeWhitespace(segment.voiceoverText || segment.text)
      .split(" ")
      .filter(Boolean).length;

    const minDur = segment.type === "hook" ? 1.6 : 1.4;
    const maxDur = words >= 16 ? 5.8 : 4.6;

    return clamp(value, minDur, maxDur);
  });

  const clampedTotal = clamped.reduce((sum, value) => sum + value, 0);

  if (clampedTotal <= 0) {
    return segments.map(() => 2.2);
  }

  const scale = normalizedTarget / clampedTotal;
  return clamped.map((value) => clamp(value * scale, 1.25, 6.5));
}

function buildCinematicCanvasFilter(aspect: JobAspect): string {
  const base = getCardVideoBaseFilters(aspect).join(",");

  return [
    `[0:v]${base}[vid]`,
    `color=c=black:s=${CANVAS_W}x${CANVAS_H}:r=30[bg]`,
    `[vid]split=2[vidmain][vidshadowsrc]`,
    `[vidshadowsrc]boxblur=18:8,eq=brightness=-0.55[shadow]`,
    `[bg][shadow]overlay=(W-w)/2+${SHADOW_X}:(H-h)/2+${SHADOW_Y}[bgshadow]`,
    `[bgshadow][vidmain]overlay=(W-w)/2:(H-h)/2[vout]`,
  ].join(";");
}

async function cutAndNormalizeSegmentClip(opts: {
  inputPath: string;
  outputPath: string;
  startSec: number;
  durationSec: number;
  aspect: JobAspect;
}): Promise<void> {
  const { inputPath, outputPath, startSec, durationSec, aspect } = opts;

  const filterComplex = buildCinematicCanvasFilter(aspect);

  const args = [
    "-y",
    "-ss",
    startSec.toFixed(3),
    "-i",
    inputPath,
    "-t",
    durationSec.toFixed(3),
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-threads",
    ffThreads,
    outputPath,
  ];

  await runCmd("ffmpeg", args, "quoteReelAssembly:cutAndNormalizeSegmentClip");
}

function chooseClipStart(
  durationAvailable: number,
  segmentDuration: number,
  segmentIndex: number,
): number {
  if (durationAvailable <= segmentDuration) return 0;

  const maxStart = Math.max(0, durationAvailable - segmentDuration);

  if (maxStart <= 0.05) return 0;

  const ratioSequence = [0.12, 0.28, 0.46, 0.62, 0.78, 0.34, 0.55];
  const ratio = ratioSequence[segmentIndex % ratioSequence.length];

  return Math.min(maxStart, maxStart * ratio);
}

async function concatPreparedSegments(opts: {
  inputPaths: string[];
  outputPath: string;
}): Promise<void> {
  const { inputPaths, outputPath } = opts;

  if (!inputPaths.length) {
    throw new Error("No prepared segments to concatenate");
  }

  const listPath = path.join(path.dirname(outputPath), `${randomUUID()}-concat.txt`);

  const fileList = inputPaths
    .map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`)
    .join("\n");

  await fs.writeFile(listPath, fileList, "utf8");

  try {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath];

    await runCmd("ffmpeg", args, "quoteReelAssembly:concatPreparedSegments");
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }
}

async function attachVoiceoverToVideo(opts: {
  videoPath: string;
  voiceoverAudioPath: string;
  outputPath: string;
}): Promise<void> {
  const { videoPath, voiceoverAudioPath, outputPath } = opts;

  const args = [
    "-y",
    "-i",
    videoPath,
    "-i",
    voiceoverAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runCmd("ffmpeg", args, "quoteReelAssembly:attachVoiceoverToVideo");
}

async function createThumbnailFromVideo(opts: {
  videoPath: string;
  outputPath: string;
  fallbackDurationSec: number;
}): Promise<void> {
  const { videoPath, outputPath, fallbackDurationSec } = opts;
  const seek = Math.min(2.4, Math.max(0.4, fallbackDurationSec / 4));

  const args = [
    "-y",
    "-ss",
    seek.toFixed(2),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ];

  await runCmd("ffmpeg", args, "quoteReelAssembly:createThumbnailFromVideo");
}

function buildSegmentAssetMap(assetPicks: QuoteReelAssetPick[]) {
  const bySegmentId = new Map<string, QuoteReelAssetPick>();

  for (const pick of assetPicks) {
    if (!pick?.segmentId || !pick?.assetPath) continue;
    bySegmentId.set(pick.segmentId, pick);
  }

  return bySegmentId;
}

export async function assembleQuoteReel(
  input: AssembleQuoteReelInput,
): Promise<AssembleQuoteReelResult> {
  const aspect = input.aspect ?? "vertical";
  const segments = input.segments ?? [];
  const assetPicks = input.assetPicks ?? [];

  if (!segments.length) {
    throw new Error("assembleQuoteReel requires at least one segment");
  }

  if (!assetPicks.length) {
    throw new Error("assembleQuoteReel requires asset picks");
  }

  await ensureDir(TMP_ROOT);

  const workspaceId = randomUUID();
  const workspaceRoot = path.join(TMP_ROOT, workspaceId);
  const preparedDir = path.join(workspaceRoot, "prepared");
  const outputDir = path.join(workspaceRoot, "output");

  await ensureDir(preparedDir);
  await ensureDir(outputDir);

  const draftVideoPath = path.join(outputDir, "quote-reel-draft.mp4");
  const finalVideoPath = path.join(outputDir, "quote-reel-final.mp4");
  const thumbPath = path.join(outputDir, "quote-reel-thumb.jpg");

  const cleanupPaths: string[] = [workspaceRoot];
  const preparedSegments: PreparedSegment[] = [];

  try {
    const assetBySegmentId = buildSegmentAssetMap(assetPicks);

    const targetDurationSec =
      typeof input.targetDurationSec === "number" && input.targetDurationSec > 0
        ? input.targetDurationSec
        : input.voiceoverAudioPath
          ? await probeDuration(input.voiceoverAudioPath)
          : 70;

    const segmentDurations = getSegmentTargetDurations(segments, targetDurationSec);

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const assetPick = assetBySegmentId.get(segment.id);

      if (!assetPick?.assetPath) {
        throw new Error(`Missing asset pick for segment ${segment.id}`);
      }

      const assetDuration = await probeDuration(assetPick.assetPath);
      const segmentDuration = clamp(segmentDurations[i], 1.25, Math.max(1.25, assetDuration));
      const startSec = chooseClipStart(assetDuration, Math.min(segmentDuration, assetDuration), i);

      const preparedPath = path.join(
        preparedDir,
        `${String(i).padStart(3, "0")}-${randomUUID()}.mp4`,
      );

      await cutAndNormalizeSegmentClip({
        inputPath: assetPick.assetPath,
        outputPath: preparedPath,
        startSec,
        durationSec: Math.min(segmentDuration, assetDuration),
        aspect,
      });

      preparedSegments.push({
        segmentId: segment.id,
        text: segment.text,
        assetPath: assetPick.assetPath,
        preparedPath,
        durationSec: Math.min(segmentDuration, assetDuration),
      });
    }

    await concatPreparedSegments({
      inputPaths: preparedSegments.map((item) => item.preparedPath),
      outputPath: draftVideoPath,
    });

    let outputVideoPath = draftVideoPath;

    if (input.voiceoverAudioPath) {
      await attachVoiceoverToVideo({
        videoPath: draftVideoPath,
        voiceoverAudioPath: input.voiceoverAudioPath,
        outputPath: finalVideoPath,
      });

      outputVideoPath = finalVideoPath;
    } else {
      await fs.copyFile(draftVideoPath, finalVideoPath);
      outputVideoPath = finalVideoPath;
    }

    const actualDurationSec = await probeDuration(outputVideoPath);

    await createThumbnailFromVideo({
      videoPath: outputVideoPath,
      outputPath: thumbPath,
      fallbackDurationSec: actualDurationSec,
    });

    return {
      draftVideoPath,
      finalVideoPath: outputVideoPath,
      thumbPath,
      cleanupPaths,
      preparedSegments,
      actualDurationSec,
    };
  } catch (error) {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
