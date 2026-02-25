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

type RenderOptions = {
  aspect?: JobAspect;
  style?: CaptionStyle;
  captionsEnabled?: boolean;
  smartCrop?: (SmartCropBox | null)[];
};

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
      continue; // ignore micro movement
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

    // subtitles filter only if enabled + path exists
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

    // Thumbnail from final cropped video
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
