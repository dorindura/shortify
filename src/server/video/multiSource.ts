import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { JobAspect } from "@lib/jobsStore";

const TMP_ROOT = path.join(process.cwd(), "tmp", "multi-source-edit");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running: ${cmd} ${args.join(" ")}`);

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
        resolve(stdout || stderr);
      } else {
        reject(new Error(`[${logPrefix}] ${cmd} exited with ${code}\n${stderr}`));
      }
    });
  });
}

export async function createMultiSourceJobWorkspace(jobId: string) {
  const root = path.join(TMP_ROOT, jobId);
  const sourcesDir = path.join(root, "sources");
  const cutsDir = path.join(root, "cuts");
  const normalizedDir = path.join(root, "normalized");
  const outputDir = path.join(root, "output");

  await ensureDir(sourcesDir);
  await ensureDir(cutsDir);
  await ensureDir(normalizedDir);
  await ensureDir(outputDir);

  return {
    root,
    sourcesDir,
    cutsDir,
    normalizedDir,
    outputDir,
  };
}

export async function cutSingleSegment(opts: {
  inputPath: string;
  startSec: number;
  endSec: number;
  outputDir: string;
}): Promise<string> {
  const { inputPath, startSec, endSec, outputDir } = opts;
  const duration = endSec - startSec;

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || duration <= 0) {
    throw new Error(`Invalid cut range: ${startSec} - ${endSec}`);
  }

  await ensureDir(outputDir);

  const outPath = path.join(outputDir, `${randomUUID()}.mp4`);

  const args = [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-crf",
    "24",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ];

  await runCmd("ffmpeg", args, "multiSource:cutSingleSegment");
  return outPath;
}

function getAspectFilters(aspect: JobAspect): string[] {
  if (aspect === "verticalLetterbox") {
    return [
      "scale=720:1280:force_original_aspect_ratio=decrease:flags=bicubic",
      "pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
      "fps=30",
      "format=yuv420p",
    ];
  }

  if (aspect === "vertical") {
    return [
      "crop=in_h*(9/16):in_h:(in_w-in_h*(9/16))/2:0",
      "scale=720:1280:flags=bicubic",
      "fps=30",
      "format=yuv420p",
    ];
  }

  return [
    "scale=1920:1080:force_original_aspect_ratio=decrease:flags=bicubic",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
    "fps=30",
    "format=yuv420p",
  ];
}

export async function normalizeSegmentForConcat(opts: {
  inputPath: string;
  aspect: JobAspect;
  outputDir: string;
}): Promise<string> {
  const { inputPath, aspect, outputDir } = opts;

  await ensureDir(outputDir);

  const outPath = path.join(outputDir, `${randomUUID()}.mp4`);
  const vf = getAspectFilters(aspect).join(",");

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    vf,
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
    outPath,
  ];

  await runCmd("ffmpeg", args, "multiSource:normalizeSegmentForConcat");
  return outPath;
}

export async function concatPreparedSegments(opts: {
  inputPaths: string[];
  outputDir: string;
}): Promise<string> {
  const { inputPaths, outputDir } = opts;

  if (!inputPaths.length) {
    throw new Error("No prepared segments to concatenate");
  }

  await ensureDir(outputDir);

  const outPath = path.join(outputDir, `${randomUUID()}-draft.mp4`);
  const listPath = path.join(outputDir, `${randomUUID()}-concat.txt`);

  const fileList = inputPaths
    .map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`)
    .join("\n");

  await fs.writeFile(listPath, fileList, "utf8");

  try {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath];

    await runCmd("ffmpeg", args, "multiSource:concatPreparedSegments");
    return outPath;
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }
}

export async function removeMultiSourceJobWorkspace(jobId: string) {
  const root = path.join(TMP_ROOT, jobId);
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
