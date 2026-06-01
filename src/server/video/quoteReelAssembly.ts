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

// Centered cinematic video card on a clean solid canvas.
const CARD_W = 1080;
const CARD_H = 780;
const CARD_RADIUS = 32;

type PreparedSegment = {
  segmentId: string;
  text: string;
  assetPath: string;
  preparedPath: string;
  durationSec: number;
  timelineStartSec: number;
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

  return [
    `scale=${CARD_W}:${CARD_H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${CARD_W}:${CARD_H}`,
    "fps=30",
    "setsar=1",
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
    if (segment.type === "cta") weight = Math.max(weight - 2, 3);

    return weight;
  });

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || segments.length;
  const raw = weights.map((weight) => (normalizedTarget * weight) / totalWeight);

  const clamped = raw.map((value, index) => {
    const segment = segments[index];
    const words = normalizeWhitespace(segment.voiceoverText || segment.text)
      .split(" ")
      .filter(Boolean).length;

    const minDur = segment.type === "hook" ? 1.55 : 1.25;
    const maxDur = words >= 16 ? 4.2 : 3.25;

    return clamp(value, minDur, maxDur);
  });

  const clampedTotal = clamped.reduce((sum, value) => sum + value, 0);

  if (clampedTotal <= 0) {
    return segments.map(() => 2.2);
  }

  const scale = normalizedTarget / clampedTotal;
  return clamped.map((value) => clamp(value * scale, 1.25, 4.8));
}

function buildCinematicCanvasFilter(aspect: JobAspect): string {
  const base = getCardVideoBaseFilters(aspect).join(",");

  return [
    `[0:v]${base},eq=brightness=-0.035:contrast=1.07:saturation=0.9,unsharp=5:5:0.35:3:3:0.14,format=rgba[vidraw]`,
    `color=c=black:s=${CANVAS_W}x${CANVAS_H}:r=30,format=rgba[bg]`,

    // rounded rectangle alpha mask
    `nullsrc=s=${CARD_W}x${CARD_H},format=gray,geq=` +
      `'lum=` +
      `if(` +
      `lte(abs(X-W/2),W/2-${CARD_RADIUS})*lte(abs(Y-H/2),H/2-${CARD_RADIUS}),` +
      `255,` +
      `if(` +
      `lte(abs(X-W/2),W/2-${CARD_RADIUS})+lte(abs(Y-H/2),H/2-${CARD_RADIUS}),` +
      `255,` +
      `if(` +
      `lte(` +
      `(abs(X-W/2)-(W/2-${CARD_RADIUS}))*(abs(X-W/2)-(W/2-${CARD_RADIUS})) + ` +
      `(abs(Y-H/2)-(H/2-${CARD_RADIUS}))*(abs(Y-H/2)-(H/2-${CARD_RADIUS})),` +
      `${CARD_RADIUS * CARD_RADIUS}` +
      `),` +
      `255,` +
      `0` +
      `)` +
      `)` +
      `)'[mask]`,

    `[vidraw][mask]alphamerge[vidrounded]`,

    `[bg][vidrounded]overlay=(W-${CARD_W})/2:(H-${CARD_H})/2[composed]`,
    `nullsrc=s=${CANVAS_W}x${CANVAS_H}:r=30,format=rgba,geq=` +
      `r='0':g='0':b='0':` +
      `a='48+28*pow((X-W/2)/(W/2),2)+24*pow((Y-H/2)/(H/2),2)+18*sin((X/W*6.283185)+(T*0.22))+12*sin(((X+Y)/(W+H)*6.283185)-(T*0.16))'` +
      `[shadowveil]`,
    `[composed][shadowveil]overlay=0:0[shadowed]`,
    `nullsrc=s=${CANVAS_W}x${CANVAS_H}:r=30,format=rgba,geq=` +
      `r='235':g='224':b='198':` +
      `a='if(gt(sin((X+T*18)*0.075+sin(Y*0.017)*7)*sin((Y-T*26)*0.082+sin(X*0.013)*9),0.994),72,0)'` +
      `[dustfine]`,
    `nullsrc=s=${CANVAS_W}x${CANVAS_H}:r=30,format=rgba,geq=` +
      `r='205':g='190':b='160':` +
      `a='if(gt(sin((X-T*9)*0.041+Y*0.019)*sin((Y+T*14)*0.047+X*0.021),0.997),95,0)'` +
      `[dustslow]`,
    `[shadowed][dustfine]overlay=0:0[withdustfine]`,
    `[withdustfine][dustslow]overlay=0:0,setsar=1,format=yuv420p[vout]`,
  ].join(";");
}

async function cutAndNormalizeSegmentClip(opts: {
  inputPath: string;
  outputPath: string;
  startSec: number;
  durationSec: number;
  aspect: JobAspect;
}): Promise<void> {
  const { inputPath, startSec, durationSec, aspect } = opts;

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
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-maxrate",
    "10M",
    "-bufsize",
    "16M",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-threads",
    ffThreads,
    opts.outputPath,
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

function buildConcatPathsToCoverDuration(
  preparedSegments: PreparedSegment[],
  targetDurationSec: number,
): string[] {
  const basePaths = preparedSegments.map((item) => item.preparedPath);
  if (!basePaths.length) return [];

  const baseDuration = preparedSegments.reduce((sum, item) => sum + item.durationSec, 0);
  const safeTarget = Math.max(0, targetDurationSec);

  if (baseDuration >= safeTarget) {
    return basePaths;
  }

  const outputPaths = [...basePaths];
  let duration = baseDuration;
  let cursor = 0;

  while (duration < safeTarget && outputPaths.length < basePaths.length * 4) {
    const segment = preparedSegments[cursor % preparedSegments.length];
    outputPaths.push(segment.preparedPath);
    duration += segment.durationSec;
    cursor += 1;
  }

  return outputPaths;
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
    "192k",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
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
    let timelineCursorSec = 0;

    const voiceoverDurationSec = input.voiceoverAudioPath
      ? await probeDuration(input.voiceoverAudioPath)
      : undefined;

    const targetDurationSec =
      typeof input.targetDurationSec === "number" && input.targetDurationSec > 0
        ? input.targetDurationSec
        : (voiceoverDurationSec ?? 70);
    const segmentDurations = getSegmentTargetDurations(segments, targetDurationSec);

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const assetPick = assetBySegmentId.get(segment.id);

      if (!assetPick?.assetPath) {
        throw new Error(`Missing asset pick for segment ${segment.id}`);
      }

      const assetDuration = await probeDuration(assetPick.assetPath);
      const segmentDuration = clamp(segmentDurations[i], 1.25, Math.max(1.25, assetDuration));
      const preparedDuration = Math.min(segmentDuration, assetDuration);
      const startSec = chooseClipStart(assetDuration, preparedDuration, i);

      const preparedPath = path.join(
        preparedDir,
        `${String(i).padStart(3, "0")}-${randomUUID()}.mp4`,
      );

      await cutAndNormalizeSegmentClip({
        inputPath: assetPick.assetPath,
        outputPath: preparedPath,
        startSec,
        durationSec: preparedDuration,
        aspect,
      });

      preparedSegments.push({
        segmentId: segment.id,
        text: segment.text,
        assetPath: assetPick.assetPath,
        preparedPath,
        durationSec: preparedDuration,
        timelineStartSec: timelineCursorSec,
      });

      timelineCursorSec += preparedDuration;
    }

    await concatPreparedSegments({
      inputPaths: buildConcatPathsToCoverDuration(
        preparedSegments,
        input.voiceoverAudioPath ? (voiceoverDurationSec ?? targetDurationSec) + 0.75 : 0,
      ),
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
