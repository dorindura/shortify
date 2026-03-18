// src/server/video/render.ts
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { CaptionStyle, JobAspect } from "@lib/jobsStore";
import type { SmartCropBox, SmartCropSegment } from "@server/video/faceCrop";

const PUBLIC_SHORTS_DIR = path.join(process.cwd(), "public", "shorts");
const PUBLIC_THUMBS_DIR = path.join(process.cwd(), "public", "thumbs");

const ffThreads = String(process.env.FFMPEG_THREADS ?? "1");

type TextOverlayPosition = "top" | "center" | "bottom";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
};

type RenderOptions = {
  aspect?: JobAspect;
  style?: CaptionStyle;
  captionsEnabled?: boolean;
  smartCrop?: (SmartCropBox | null)[];
  textOverlays?: TextOverlay[];
};

async function ensureDir(dir: string) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function runFfmpeg(args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ffmpeg ${args.join(" ")}`);
    const proc = spawn("ffmpeg", args);

    proc.stderr.on("data", (data) => {
      console.log(`[${logPrefix}] ffmpeg stderr: ${data}`);
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function escapeForSubtitles(pathStr: string): string {
  return pathStr
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\#/g, "\\#")
    .replace(/\;/g, "\\;")
    .replace(/\r?\n/g, " ");
}

function normalizeOverlayText(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function getOverlayY(position: TextOverlayPosition): string {
  if (position === "top") return "220";
  if (position === "center") return "(h-text_h)/2";
  return "h-text_h-420";
}

function buildOverlayDrawtextFilters(overlays: TextOverlay[]): string[] {
  if (!overlays.length) return [];

  const fontPath = path.join(
    process.cwd(),
    "public",
    "fonts",
    "Inter-SemiBold.ttf",
  );

  return overlays
    .filter((overlay) => {
      const text = normalizeOverlayText(overlay.text);
      return (
        !!text &&
        Number.isFinite(overlay.startSec) &&
        Number.isFinite(overlay.endSec) &&
        overlay.endSec > overlay.startSec
      );
    })
    .map((overlay) => {
      const text = escapeDrawtextText(normalizeOverlayText(overlay.text));
      const y = getOverlayY(overlay.position);

      return (
        `drawtext=` +
        `fontfile='${fontPath}':` +
        `text='${text}':` +
        `fontcolor=white:` +
        `fontsize=64:` +
        `line_spacing=10:` +
        `x=(w-text_w)/2:` +
        `y=${y}:` +
        `borderw=6:` +
        `bordercolor=black@0.88:` +
        `shadowx=0:` +
        `shadowy=4:` +
        `shadowcolor=black@0.55:` +
        `box=1:` +
        `boxcolor=black@0.20:` +
        `boxborderw=18:` +
        `fix_bounds=true:` +
        `enable='between(t\\,${overlay.startSec.toFixed(3)}\\,${
          overlay.endSec.toFixed(3)
        })'`
      );
    });
}

function buildCropXExprForSegments(segments: SmartCropSegment[]): string {
  if (!segments.length) {
    return "min(max(in_w*0.5-540\\,0)\\,in_w-1080)";
  }

  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);

  const MIN_MOVE = 0.035;
  const D = 0.45;

  const exprForCx = (cxNorm: number): string => {
    const cx = Math.max(0, Math.min(1, cxNorm));
    const cw = "in_h*(9/16)";
    return `min(max(in_w*${cx.toFixed(4)}-${cw}/2\\,0)\\,in_w-${cw})`;
  };

  const smoothstep = (u: string) => `(${u}*${u}*(3-2*${u}))`;

  const lerp = (a: string, b: string, u: string) => `(${a}+(${b}-${a})*${u})`;

  let raw = exprForCx(sorted[sorted.length - 1].centerXNorm);

  for (let i = sorted.length - 2; i >= 0; i--) {
    const prev = sorted[i];
    const next = sorted[i + 1];

    if (Math.abs(next.centerXNorm - prev.centerXNorm) < MIN_MOVE) {
      continue;
    }

    const x0 = exprForCx(prev.centerXNorm);
    const x1 = exprForCx(next.centerXNorm);
    const B = next.tStart;

    const u = `clip((t-${(B - D).toFixed(3)})/${(2 * D).toFixed(3)}\\,0\\,1)`;
    const eased = smoothstep(u);
    const blend = lerp(x0, x1, eased);

    raw = `if(lt(t\\,${(B - D).toFixed(3)})\\,${x0}\\,` +
      `if(lt(t\\,${(B + D).toFixed(3)})\\,${blend}\\,${raw}))`;
  }

  return raw;
}

export async function renderShortsWithSubtitles(
  clips: string[],
  subtitleFiles: string[],
  opts?: RenderOptions,
): Promise<{ videos: string[]; thumbs: string[] }> {
  await ensureDir(PUBLIC_SHORTS_DIR);
  await ensureDir(PUBLIC_THUMBS_DIR);

  const aspect = opts?.aspect ?? "horizontal";
  const captionsEnabled = opts?.captionsEnabled ?? true;

  const videoUrls: string[] = [];
  const thumbUrls: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clipPath = clips[i];
    const subsPath = subtitleFiles[i] ? path.resolve(subtitleFiles[i]) : null;

    if (captionsEnabled && subsPath && !fs.existsSync(subsPath)) {
      console.error(
        "[renderShortsWithSubtitles] subtitle file does not exist:",
        subsPath,
      );
    }

    const id = randomUUID();
    const outVideoPath = path.join(PUBLIC_SHORTS_DIR, `${id}.mp4`);
    const outThumbPath = path.join(PUBLIC_THUMBS_DIR, `${id}.jpg`);

    const publicVideoUrl = `/shorts/${id}.mp4`;
    const publicThumbUrl = `/thumbs/${id}.jpg`;

    let subtitlesFilter: string | null = null;
    if (captionsEnabled && subsPath) {
      const escapedSubs = escapeForSubtitles(subsPath);

      const fontsDir = path.join(process.cwd(), "public", "fonts");
      const escapedFontsDir = escapeForSubtitles(fontsDir);

      subtitlesFilter =
        `subtitles='${escapedSubs}':fontsdir='${escapedFontsDir}'`;
    }

    const filters: string[] = [];

    if (aspect === "verticalLetterbox") {
      filters.push(
        "scale=1080:1920:force_original_aspect_ratio=decrease:flags=bicubic,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      );
    }

    if (aspect === "vertical") {
      const cropInfo = opts?.smartCrop?.[i] ?? null;

      if (cropInfo && cropInfo.segments && cropInfo.segments.length > 0) {
        const xExpr = buildCropXExprForSegments(cropInfo.segments);
        filters.push(`crop=in_h*(9/16):in_h:${xExpr}:0`);
      } else {
        filters.push("crop=in_h*(9/16):in_h:(in_w-oh*(9/16))/2:0");
      }

      filters.push("scale=1080:1920:flags=bicubic");
    }

    if (subtitlesFilter) {
      filters.push(subtitlesFilter);
    }

    const overlaysForClip = (opts?.textOverlays ?? []).filter(
      (overlay) => overlay.clipIndex === i,
    );

    const overlayFilters = buildOverlayDrawtextFilters(overlaysForClip);
    if (overlayFilters.length) {
      filters.push(...overlayFilters);
    }

    const filter = filters.join(",");

    const ffArgs = [
      "-y",
      "-i",
      clipPath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-crf",
      "24",
      "-maxrate",
      "4M",
      "-bufsize",
      "7M",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-threads",
      ffThreads,
      "-movflags",
      "+faststart",
      outVideoPath,
    ];

    await runFfmpeg(ffArgs, `renderShortsWithSubtitles:${id}`);

    await runFfmpeg(
      [
        "-y",
        "-ss",
        "2",
        "-i",
        outVideoPath,
        "-vframes",
        "1",
        "-q:v",
        "2",
        outThumbPath,
      ],
      `renderShortsThumb:${id}`,
    );

    videoUrls.push(publicVideoUrl);
    thumbUrls.push(publicThumbUrl);
  }

  return { videos: videoUrls, thumbs: thumbUrls };
}
