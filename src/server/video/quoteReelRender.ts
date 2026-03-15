import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const TMP_DIR = path.join(process.cwd(), "tmp", "quote-reels");
const ffThreads = String(process.env.FFMPEG_THREADS ?? "1");
const FPS = 25;
const WIDTH = 1080;
const HEIGHT = 1920;

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function runFfmpeg(args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);

    proc.stderr.on("data", (d) => {
      console.log(`[${logPrefix}] ${d.toString()}`);
    });

    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(new Error(`${logPrefix} failed with code ${code} signal ${signal ?? "none"}`));
      }
    });
  });
}

function escapeText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\#/g, "\\#")
    .replace(/\;/g, "\\;");
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeQuote(rawQuote: string) {
  return normalizeWhitespace(rawQuote)
    .replace(/^["“”'\s]+/, "")
    .replace(/["“”'\s]+$/, "");
}

function sanitizeAuthor(rawAuthor: string) {
  return normalizeWhitespace(rawAuthor)
    .replace(/^[-—–\s]+/, "")
    .replace(/\s+/g, " ");
}

function splitIntoLinesByWords(text: string, maxCharsPerLine: number): string[] {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  return lines;
}

function buildQuoteLayout(rawQuote: string) {
  const cleanQuote = sanitizeQuote(rawQuote);
  const quote = `“${cleanQuote}”`;

  const presets = [
    { fontSize: 56, maxCharsPerLine: 20, maxLines: 3, lineSpacing: 18 },
    { fontSize: 52, maxCharsPerLine: 22, maxLines: 3, lineSpacing: 17 },
    { fontSize: 48, maxCharsPerLine: 24, maxLines: 4, lineSpacing: 16 },
    { fontSize: 44, maxCharsPerLine: 26, maxLines: 4, lineSpacing: 15 },
    { fontSize: 40, maxCharsPerLine: 28, maxLines: 4, lineSpacing: 14 },
    { fontSize: 36, maxCharsPerLine: 30, maxLines: 5, lineSpacing: 13 },
  ];

  let selected = presets[presets.length - 1];
  let lines: string[] = [];

  for (const preset of presets) {
    const attempt = splitIntoLinesByWords(quote, preset.maxCharsPerLine);
    if (attempt.length <= preset.maxLines) {
      selected = preset;
      lines = attempt;
      break;
    }
  }

  if (!lines.length) {
    lines = splitIntoLinesByWords(quote, selected.maxCharsPerLine);
  }

  const lineHeight = selected.fontSize + selected.lineSpacing;
  const blockHeight = lines.length * lineHeight - selected.lineSpacing;

  const startY = Math.round((HEIGHT - blockHeight) / 2) - 70;
  const authorFontSize = clamp(Math.round(selected.fontSize * 0.42), 24, 32);
  const authorY = startY + blockHeight + 54;

  return {
    lines,
    fontSize: selected.fontSize,
    lineSpacing: selected.lineSpacing,
    lineHeight,
    startY,
    authorFontSize,
    authorY,
  };
}

async function rmSafe(targetPath: string) {
  await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
}

async function createNormalizedStill(inputPath: string, outputPath: string) {
  await runFfmpeg(
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      [
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${WIDTH}:${HEIGHT}`,
        "setsar=1",
        "format=yuv420p",
      ].join(","),
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ],
    "quoteReelNormalizeStill",
  );
}

async function copyFileManyTimes(
  sourcePath: string,
  outputDir: string,
  startIndex: number,
  count: number,
) {
  let current = startIndex;

  for (let i = 0; i < count; i += 1) {
    const filename = `frame_${String(current).padStart(6, "0")}.jpg`;
    const dest = path.join(outputDir, filename);
    await fs.copyFile(sourcePath, dest);
    current += 1;
  }

  return current;
}

export async function renderQuoteReelFromImages(input: {
  images: string[];
  secondsPerImage: number;
  quote: string;
  author: string;
}) {
  await ensureDir(TMP_DIR);

  if (!input.images.length) {
    throw new Error("renderQuoteReelFromImages requires images.");
  }

  const id = randomUUID();
  const jobDir = path.join(TMP_DIR, id);
  const normalizedDir = path.join(jobDir, "normalized");
  const framesDir = path.join(jobDir, "frames");

  const outVideoRawPath = path.join(jobDir, "quote-reel-raw.mp4");
  const outVideoPath = path.join(TMP_DIR, `${id}.mp4`);
  const outThumbPath = path.join(TMP_DIR, `${id}.jpg`);

  const secondsPerImage = clamp(input.secondsPerImage, 0.45, 1.2);
  const framesPerImage = Math.max(1, Math.round(secondsPerImage * FPS));

  const fontQuote = path.join(process.cwd(), "public", "fonts", "PlayfairDisplay-Bold.ttf");
  const fontAuthor = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");

  const layout = buildQuoteLayout(input.quote);
  const cleanAuthor = sanitizeAuthor(input.author);

  await ensureDir(jobDir);
  await ensureDir(normalizedDir);
  await ensureDir(framesDir);

  try {
    // 1) Normalize each selected image once
    const normalizedImages: string[] = [];

    for (let i = 0; i < input.images.length; i += 1) {
      const source = input.images[i];
      const normalizedPath = path.join(
        normalizedDir,
        `normalized_${String(i).padStart(3, "0")}.jpg`,
      );

      await createNormalizedStill(source, normalizedPath);
      normalizedImages.push(normalizedPath);
    }

    // 2) Expand into real frame sequence
    let frameIndex = 1;

    for (const normalizedPath of normalizedImages) {
      frameIndex = await copyFileManyTimes(normalizedPath, framesDir, frameIndex, framesPerImage);
    }

    const totalFrames = frameIndex - 1;
    const totalDuration = totalFrames / FPS;

    // 3) Build raw slideshow video from frame sequence
    await runFfmpeg(
      [
        "-y",
        "-framerate",
        String(FPS),
        "-i",
        path.join(framesDir, "frame_%06d.jpg"),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-threads",
        ffThreads,
        outVideoRawPath,
      ],
      "renderQuoteReelFramesToVideo",
    );

    // 4) Overlay quote + author + fade on final raw video
    const vfParts: string[] = [`drawbox=x=0:y=0:w=${WIDTH}:h=${HEIGHT}:color=black@0.10:t=fill`];

    layout.lines.forEach((line, index) => {
      const y = layout.startY + index * layout.lineHeight;

      vfParts.push(
        `drawtext=fontfile='${fontQuote}':text='${escapeText(
          line,
        )}':fontcolor=white:fontsize=${layout.fontSize}:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.90:shadowx=0:shadowy=8:fix_bounds=true`,
      );
    });

    vfParts.push(
      `drawtext=fontfile='${fontAuthor}':text='${escapeText(
        `— ${cleanAuthor}`,
      )}':fontcolor=white@0.95:fontsize=${layout.authorFontSize}:x=(w-text_w)/2:y=${layout.authorY}:shadowcolor=black@0.75:shadowx=0:shadowy=4:fix_bounds=true`,
    );

    vfParts.push("fade=t=in:st=0:d=0.6");

    // optional final fade out if you want it later:
    // const fadeOutStart = Math.max(0, totalDuration - 0.6);
    // vfParts.push(`fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.6`);

    await runFfmpeg(
      [
        "-y",
        "-i",
        outVideoRawPath,
        "-vf",
        vfParts.join(","),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-threads",
        ffThreads,
        outVideoPath,
      ],
      "renderQuoteReelOverlay",
    );

    // 5) Thumbnail
    const thumbSeek = Math.min(1.3, Math.max(0.2, totalDuration / 3));

    await runFfmpeg(
      [
        "-y",
        "-ss",
        thumbSeek.toFixed(2),
        "-i",
        outVideoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outThumbPath,
      ],
      "renderQuoteReelThumb",
    );

    return { videoPath: outVideoPath, thumbPath: outThumbPath };
  } finally {
    await rmSafe(jobDir);
  }
}
