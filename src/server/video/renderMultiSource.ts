import fsPromises from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type {
  EndingConfig,
  FinalTimelineOverlay,
  JobAspect,
  MultiSourceBlackWhiteRange,
} from "@lib/jobsStore";
import { createOverlayAsset } from "@server/video/overlayAsset";
import { applyEndingToVideo } from "@server/video/ending";

const TMP_RENDER_DIR = path.join(process.cwd(), "tmp", "multi-source-render");

async function ensureDir(dir: string) {
  await fsPromises.mkdir(dir, { recursive: true });
}

function runFfmpeg(args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ffmpeg ${args.join(" ")}`);

    const proc = spawn("ffmpeg", args);

    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      console.log(`[${logPrefix}] ffmpeg stderr: ${data}`);
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(new Error(`[${logPrefix}] ffmpeg exited with code ${code}\n${stderr}`));
      }
    });
  });
}

function escapeFilterPath(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function getAspectFilters(aspect: JobAspect): string[] {
  if (aspect === "verticalLetterbox") {
    return [
      "scale=1080:1920:force_original_aspect_ratio=decrease:flags=bicubic",
      "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "format=yuv420p",
    ];
  }

  if (aspect === "vertical") {
    return [
      "scale=1080:1920:force_original_aspect_ratio=increase:flags=bicubic",
      "crop=1080:1920",
      "format=yuv420p",
    ];
  }

  return [
    "scale=1920:1080:force_original_aspect_ratio=decrease:flags=bicubic",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
    "format=yuv420p",
  ];
}

function getOverlayAssetY(position: "top" | "center" | "bottom"): string {
  if (position === "top") return "110";
  if (position === "center") return "(H-h)/2";
  return "H-h-260";
}

function buildBlackWhiteEnableExpr(ranges: MultiSourceBlackWhiteRange[]): string | null {
  const validRanges = ranges.filter(
    (r) => Number.isFinite(r.startSec) && Number.isFinite(r.endSec) && r.endSec > r.startSec,
  );

  if (!validRanges.length) return null;

  return validRanges
    .map((r) => `between(t\\,${r.startSec.toFixed(3)}\\,${r.endSec.toFixed(3)})`)
    .join("+");
}

async function buildTimelineOverlayFilterComplex(
  overlays: FinalTimelineOverlay[],
): Promise<{ chains: string[]; finalLabel: string; assetPaths: string[] }> {
  const validOverlays = overlays.filter(
    (overlay) =>
      overlay?.id &&
      String(overlay?.text ?? "").trim() &&
      Number.isFinite(overlay.startSec) &&
      Number.isFinite(overlay.endSec) &&
      overlay.endSec > overlay.startSec,
  );

  if (!validOverlays.length) {
    return { chains: [], finalLabel: "[vbase]", assetPaths: [] };
  }

  const chains: string[] = [];
  const assetPaths: string[] = [];
  let currentLabel = "[vbase]";
  let step = 0;

  for (const overlay of validOverlays) {
    const assetPath = await createOverlayAsset({
      id: overlay.id,
      clipIndex: 0,
      text: overlay.text,
      startSec: overlay.startSec,
      endSec: overlay.endSec,
      position: overlay.position,
      emoji: overlay.emoji,
      emojiPlacement: overlay.emojiPlacement,
    });

    if (!assetPath) continue;

    assetPaths.push(assetPath);

    const escapedAssetPath = escapeFilterPath(path.resolve(assetPath));
    const assetLabel = `[ovr${step + 1}]`;
    const nextLabel = `[v${++step}]`;
    const y = getOverlayAssetY(overlay.position);

    chains.push(`movie='${escapedAssetPath}'${assetLabel}`);
    chains.push(
      `${currentLabel}${assetLabel}overlay=` +
        `x=(W-w)/2:` +
        `y=${y}:` +
        `enable='between(t\\,${overlay.startSec.toFixed(3)}\\,${overlay.endSec.toFixed(3)})'` +
        `${nextLabel}`,
    );

    currentLabel = nextLabel;
  }

  return {
    chains,
    finalLabel: currentLabel,
    assetPaths,
  };
}

export async function renderMultiSourceFinalVideo(opts: {
  inputPath: string;
  aspect: JobAspect;
  textOverlays?: FinalTimelineOverlay[];
  blackWhiteRanges?: MultiSourceBlackWhiteRange[];
  ending?: EndingConfig | null;
}): Promise<{ finalVideoPath: string; cleanupPaths: string[] }> {
  const { inputPath, aspect, textOverlays = [], blackWhiteRanges = [], ending = null } = opts;

  await ensureDir(TMP_RENDER_DIR);

  const renderedPath = path.join(TMP_RENDER_DIR, `${randomUUID()}.mp4`);
  const cleanupPaths: string[] = [];

  const baseFilters = [...getAspectFilters(aspect)];

  const bwExpr = buildBlackWhiteEnableExpr(blackWhiteRanges);
  if (bwExpr) {
    baseFilters.push(`eq=brightness=-0.12:saturation=0.85:enable='${bwExpr}'`);
  }

  const filterComplexParts: string[] = [];
  filterComplexParts.push(`[0:v]${baseFilters.join(",")}[vbase]`);

  const {
    chains: overlayChains,
    finalLabel,
    assetPaths,
  } = await buildTimelineOverlayFilterComplex(textOverlays);

  if (overlayChains.length) {
    filterComplexParts.push(...overlayChains);
  }

  const filterComplex = filterComplexParts.join(";");

  try {
    await runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-filter_complex",
        filterComplex,
        "-map",
        finalLabel,
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "superfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        renderedPath,
      ],
      "renderMultiSourceFinalVideo",
    );

    cleanupPaths.push(renderedPath);

    const endedPath = await applyEndingToVideo(renderedPath, ending);
    if (endedPath !== renderedPath) {
      cleanupPaths.push(endedPath);
    }

    return {
      finalVideoPath: endedPath,
      cleanupPaths,
    };
  } finally {
    await Promise.all(assetPaths.map((p) => fsPromises.unlink(p).catch(() => {})));
  }
}
