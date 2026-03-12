import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const TMP_DIR = path.join(process.cwd(), "tmp", "quote-reels");
const ffThreads = String(process.env.FFMPEG_THREADS ?? "1");

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
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${logPrefix} failed with code ${code}`));
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

  const startY = Math.round((1920 - blockHeight) / 2) - 70;
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
  const outVideoPath = path.join(TMP_DIR, `${id}.mp4`);
  const outThumbPath = path.join(TMP_DIR, `${id}.jpg`);

  const secondsPerImage = clamp(input.secondsPerImage, 0.45, 1.2);

  const fontQuote = path.join(process.cwd(), "public", "fonts", "PlayfairDisplay-Bold.ttf");
  const fontAuthor = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");

  const layout = buildQuoteLayout(input.quote);
  const cleanAuthor = sanitizeAuthor(input.author);

  const ffmpegInputs: string[] = [];
  const filterParts: string[] = [];

  input.images.forEach((img, index) => {
    ffmpegInputs.push("-loop", "1", "-t", String(secondsPerImage), "-i", img);

    filterParts.push(
      `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,setsar=1,format=yuv420p[v${index}]`,
    );
  });

  const concatInputs = input.images.map((_, index) => `[v${index}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${input.images.length}:v=1:a=0[bg]`);

  const overlayParts: string[] = [`[bg]drawbox=x=0:y=0:w=1080:h=1920:color=black@0.10:t=fill`];

  layout.lines.forEach((line, index) => {
    const y = layout.startY + index * layout.lineHeight;

    overlayParts.push(
      `drawtext=fontfile='${fontQuote}':text='${escapeText(
        line,
      )}':fontcolor=white:fontsize=${layout.fontSize}:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.90:shadowx=0:shadowy=8:fix_bounds=true`,
    );
  });

  overlayParts.push(
    `drawtext=fontfile='${fontAuthor}':text='${escapeText(
      `— ${cleanAuthor}`,
    )}':fontcolor=white@0.95:fontsize=${layout.authorFontSize}:x=(w-text_w)/2:y=${layout.authorY}:shadowcolor=black@0.75:shadowx=0:shadowy=4:fix_bounds=true`,
  );

  overlayParts.push("fade=t=in:st=0:d=0.6[outv]");

  filterParts.push(overlayParts.join(","));

  const filterComplex = filterParts.join(";");

  await runFfmpeg(
    [
      "-y",
      ...ffmpegInputs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[outv]",
      "-r",
      "25",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
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
    "renderQuoteReelFromImages",
  );

  await runFfmpeg(
    ["-y", "-ss", "1.3", "-i", outVideoPath, "-frames:v", "1", "-q:v", "2", outThumbPath],
    "renderQuoteReelThumb",
  );

  return { videoPath: outVideoPath, thumbPath: outThumbPath };
}
