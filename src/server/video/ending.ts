import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { createEndingAsset, type EndingConfig } from "@server/video/endingAsset";

const TMP_ENDINGS_DIR = path.join(process.cwd(), "tmp", "endings");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function runFfmpeg(args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(new Error(`[${logPrefix}] ffmpeg exited with ${code}\n${stderr}`));
      }
    });
  });
}

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`ffprobe exited with ${code}\n${stderr}`));
    });
  });
}

async function probeDuration(videoPath: string): Promise<number> {
  const out = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);

  const duration = Number(out);
  return Number.isFinite(duration) ? duration : 0;
}

function escapeFilterPath(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function getOverlayY(position?: "top" | "center" | "bottom"): string {
  switch (position) {
    case "top":
      return "100";
    case "center":
      return "(H-h)/2";
    case "bottom":
    default:
      return "H-h-220";
  }
}

export async function applyEndingToVideo(
  inputPath: string,
  ending?: EndingConfig | null,
): Promise<string> {
  if (!ending || ending.type === "none") {
    return inputPath;
  }

  await ensureDir(TMP_ENDINGS_DIR);

  const outPath = path.join(TMP_ENDINGS_DIR, `${randomUUID()}.mp4`);
  const duration = Math.max(0.5, Math.min(3, Number(ending.durationSec ?? 1.2)));
  const inputDuration = await probeDuration(inputPath);
  const startTime = inputDuration + 0.05;

  const endingAssetPath = await createEndingAsset(ending);

  try {
    if (ending.type === "freeze") {
      const filterParts: string[] = [`[0:v]tpad=stop_mode=clone:stop_duration=${duration}[v0]`];
      let finalVideoLabel = "[v0]";

      if (endingAssetPath) {
        const escapedAssetPath = escapeFilterPath(path.resolve(endingAssetPath));
        filterParts.push(`movie='${escapedAssetPath}'[endingasset]`);
        filterParts.push(
          `[v0][endingasset]overlay=` +
            `x=(W-w)/2:` +
            `y=${getOverlayY(ending.position)}:` +
            `enable='gte(t,${startTime.toFixed(3)})'[vout]`,
        );
        finalVideoLabel = "[vout]";
      }

      await runFfmpeg(
        [
          "-y",
          "-i",
          inputPath,
          "-filter_complex",
          filterParts.join(";"),
          "-map",
          finalVideoLabel,
          "-map",
          "0:a?",
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
          "-movflags",
          "+faststart",
          outPath,
        ],
        "applyEndingToVideo:freeze",
      );

      return outPath;
    }

    if (ending.type === "fadeBlack") {
      const fadeStart = inputDuration;
      const fadeDuration = duration;

      const filterParts: string[] = [
        `[0:v]tpad=stop_mode=clone:stop_duration=${duration},fade=t=out:st=${fadeStart.toFixed(
          3,
        )}:d=${fadeDuration.toFixed(3)}[v0]`,
      ];

      let finalVideoLabel = "[v0]";

      if (endingAssetPath) {
        const escapedAssetPath = escapeFilterPath(path.resolve(endingAssetPath));
        filterParts.push(`movie='${escapedAssetPath}'[endingasset]`);
        filterParts.push(
          `[v0][endingasset]overlay=` +
            `x=(W-w)/2:` +
            `y=${getOverlayY(ending.position)}:` +
            `enable='gte(t,${startTime.toFixed(3)})'[vout]`,
        );
        finalVideoLabel = "[vout]";
      }

      await runFfmpeg(
        [
          "-y",
          "-i",
          inputPath,
          "-filter_complex",
          filterParts.join(";"),
          "-map",
          finalVideoLabel,
          "-map",
          "0:a?",
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
          "-movflags",
          "+faststart",
          outPath,
        ],
        "applyEndingToVideo:fadeBlack",
      );

      return outPath;
    }

    if (ending.type === "endCard") {
      const filterParts: string[] = [
        `[0:v]tpad=stop_mode=clone:stop_duration=${duration}[vbase]`,
        `[vbase]drawbox=` +
          `x=0:y=0:w=iw:h=ih:` +
          `color=black@0.88:` +
          `t=fill:` +
          `enable='gte(t,${startTime.toFixed(3)})'[v0]`,
      ];

      let finalVideoLabel = "[v0]";

      if (endingAssetPath) {
        const escapedAssetPath = escapeFilterPath(path.resolve(endingAssetPath));
        filterParts.push(`movie='${escapedAssetPath}'[endingasset]`);
        filterParts.push(
          `[v0][endingasset]overlay=` +
            `x=(W-w)/2:` +
            `y=${getOverlayY(ending.position)}:` +
            `enable='gte(t,${startTime.toFixed(3)})'[vout]`,
        );
        finalVideoLabel = "[vout]";
      }

      await runFfmpeg(
        [
          "-y",
          "-i",
          inputPath,
          "-filter_complex",
          filterParts.join(";"),
          "-map",
          finalVideoLabel,
          "-map",
          "0:a?",
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
          "-movflags",
          "+faststart",
          outPath,
        ],
        "applyEndingToVideo:endCard",
      );

      return outPath;
    }

    return inputPath;
  } finally {
    if (endingAssetPath) {
      await fs.unlink(endingAssetPath).catch(() => {});
    }
  }
}
