// src/server/video/clip.ts
import { spawn } from "child_process";
import path from "path";
import fsp from "fs/promises";
import { randomUUID } from "crypto";

const CLIPS_DIR = path.join(process.cwd(), "uploads", "clips");

async function ensureDir(dir: string) {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
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
      const text = data.toString();
      stderr += text;
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function probeDuration(videoPath: string): Promise<number> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ];

  const output = await runCmd("ffprobe", args, "probeDuration");
  const secs = parseFloat(output.trim());
  return secs;
}

type LoudSegment = {
  start: number;
  end: number;
  duration: number;
};

/**
 * Use ffmpeg silencedetect to get silence ranges,
 * then derive "loud" segments between silences.
 */
async function analyzeLoudSegments(videoPath: string): Promise<LoudSegment[]> {
  // tweak noise/d as needed
  const args = ["-i", videoPath, "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"];

  const log = await runCmd("ffmpeg", args, "silencedetect");

  const silenceStartRegex = /silence_start:\s*([0-9.]+)/g;
  const silenceEndRegex = /silence_end:\s*([0-9.]+)/g;

  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];

  let m: RegExpExecArray | null;

  while ((m = silenceStartRegex.exec(log)) !== null) {
    silenceStarts.push(parseFloat(m[1]));
  }
  while ((m = silenceEndRegex.exec(log)) !== null) {
    silenceEnds.push(parseFloat(m[1]));
  }

  // Pair starts & ends; handle any unbalanced cases safely
  const pairs: { start: number; end: number }[] = [];
  let sIdx = 0;
  let eIdx = 0;

  while (sIdx < silenceStarts.length || eIdx < silenceEnds.length) {
    const start = silenceStarts[sIdx] ?? null;
    const end = silenceEnds[eIdx] ?? null;

    if (start !== null && end !== null && end >= start) {
      pairs.push({ start, end });
      sIdx++;
      eIdx++;
    } else if (end !== null && (start === null || end < start)) {
      // end before any start -> treat as leading silence end
      pairs.push({ start: 0, end });
      eIdx++;
    } else if (start !== null && (end === null || start < end)) {
      // trailing silence with no end, ignore
      sIdx++;
    } else {
      break;
    }
  }

  const duration = await probeDuration(videoPath);

  const loud: LoudSegment[] = [];
  let current = 0;

  // loud segment before first silence
  for (const pair of pairs) {
    if (pair.start > current) {
      loud.push({
        start: current,
        end: pair.start,
        duration: pair.start - current,
      });
    }
    current = pair.end;
  }

  // loud segment after last silence
  if (current < duration) {
    loud.push({
      start: current,
      end: duration,
      duration: duration - current,
    });
  }

  return loud;
}

/**
 * Choose the "best" loud segments:
 * - At least clipDuration each
 * - Spread roughly across the video
 * - Limit to maxClips
 */
function pickClipWindows(
  loudSegments: LoudSegment[],
  clipDuration: number,
  maxClips: number,
): { start: number; end: number }[] {
  // Filter segments that can fit one full clip
  const candidates = loudSegments.filter((seg) => seg.duration >= clipDuration);

  if (candidates.length === 0) {
    return [];
  }

  // Sort by duration (descending) – longer segments often are more “meaningful”
  candidates.sort((a, b) => b.duration - a.duration);

  const chosen: { start: number; end: number }[] = [];

  for (const seg of candidates) {
    if (chosen.length >= maxClips) break;

    // Place the clip roughly in the middle of the loud segment
    const center = (seg.start + seg.end) / 2;
    let clipStart = center - clipDuration / 2;

    if (clipStart < seg.start) clipStart = seg.start;
    if (clipStart + clipDuration > seg.end) clipStart = seg.end - clipDuration;

    if (clipStart < 0) clipStart = 0;

    const clipEnd = clipStart + clipDuration;

    // you could also enforce spacing between clips here
    chosen.push({ start: clipStart, end: clipEnd });
  }
  return chosen;
}

/**
 * NEW: explicit ranges for AI-selected clips (transcript-based).
 * Each range defines its own duration (end - start).
 */
export type ClipRange = {
  start: number;
  end: number;
};

export async function createClipsFromVideoUsingRanges(
  videoPath: string,
  ranges: ClipRange[],
): Promise<string[]> {
  await ensureDir(CLIPS_DIR);

  const normalized = [...ranges]
    .map((r) => ({
      start: Math.max(0, Number.isFinite(r.start) ? r.start : 0),
      end: Number.isFinite(r.end) ? r.end : 0,
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const outputs: string[] = [];
  let lastEnd = -Infinity;

  for (const r of normalized) {
    let start = r.start;
    const end = r.end;

    // dacă overlap, îl tăiem ca să nu repetăm secvența
    if (start < lastEnd) start = lastEnd;

    // dacă după tăiere a rămas prea mic, sari peste
    if (end - start < 0.6) continue;

    const duration = end - start;
    lastEnd = start + duration;

    const id = randomUUID();
    const outPath = path.join(CLIPS_DIR, `${id}.mp4`);

    const args = [
      "-y",
      "-ss",
      String(start),
      "-i",
      videoPath,
      "-t",
      String(duration),

      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",

      "-movflags",
      "+faststart",
      outPath,
    ];

    await runCmd("ffmpeg", args, "createClipRanges");
    outputs.push(outPath);
  }

  return outputs;
}

/**
 * Smart clip generator:
 * - uses silencedetect to find loud segments
 * - chooses up to `maxClips` of length `clipDurationSec`
 * - falls back to naive evenly spaced clipping if analysis fails
 */
export async function createClipsFromVideo(
  videoPath: string,
  opts?: { clipDurationSec?: number; maxClips?: number },
): Promise<string[]> {
  const clipDurationSec = opts?.clipDurationSec ?? 30; // default 30s
  const maxClips = opts?.maxClips ?? 2; // default 2 shorts

  await ensureDir(CLIPS_DIR);

  try {
    const loudSegments = await analyzeLoudSegments(videoPath);
    const windows = pickClipWindows(loudSegments, clipDurationSec, maxClips);

    // If analysis gave nothing – fallback
    if (windows.length === 0) {
      console.warn("[createClipsFromVideo] Falling back to naive clipping");
      return await createNaiveClips(videoPath, clipDurationSec, maxClips);
    }

    const outputs: string[] = [];

    for (const win of windows) {
      const id = randomUUID();
      const outPath = path.join(CLIPS_DIR, `${id}.mp4`);

      const args = [
        "-y",
        "-ss",
        String(win.start),
        "-i",
        videoPath,
        "-t",
        String(clipDurationSec),
        "-c",
        "copy",
        outPath,
      ];

      await runCmd("ffmpeg", args, "createClipSmart");
      outputs.push(outPath);
    }

    return outputs;
  } catch (err) {
    console.error("[createClipsFromVideo] Error in smart clipping, fallback:", err);
    return await createNaiveClips(videoPath, clipDurationSec, maxClips);
  }
}

async function createNaiveClips(
  videoPath: string,
  clipDurationSec: number,
  maxClips: number,
): Promise<string[]> {
  await ensureDir(CLIPS_DIR);
  const duration = await probeDuration(videoPath);

  const outputs: string[] = [];
  const step = duration / (maxClips + 1); // spread across

  for (let i = 0; i < maxClips; i++) {
    const startTime = Math.max(0, step * (i + 1) - clipDurationSec / 2);
    const id = randomUUID();
    const outPath = path.join(CLIPS_DIR, `${id}.mp4`);

    const args = [
      "-y",
      "-ss",
      String(startTime),
      "-i",
      videoPath,
      "-t",
      String(clipDurationSec),
      "-c",
      "copy",
      outPath,
    ];

    await runCmd("ffmpeg", args, "createClipNaive");
    outputs.push(outPath);
  }

  return outputs;
}

export async function concatClipsToSingleVideo(clips: string[]): Promise<string> {
  await ensureDir(CLIPS_DIR);

  if (!clips.length) throw new Error("No clips to concat");

  const id = randomUUID();
  const outPath = path.join(CLIPS_DIR, `${id}-summary.mp4`);

  // ffmpeg concat demuxer needs a file list
  const listPath = path.join(CLIPS_DIR, `${id}-concat.txt`);
  const fileList = clips.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n");

  await fsp.writeFile(listPath, fileList, "utf8");

  // Re-encode for maximum compatibility (sa nu crape pe codec mismatch)
  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outPath,
  ];

  await runCmd("ffmpeg", args, "concatSummary");
  // optional cleanup list
  fsp.unlink(listPath).catch(() => {});
  return outPath;
}
