// src/server/video/quoteReelPoster.ts
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import OpenAI from "openai";
import type { QuoteReelTone } from "@lib/jobsStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const TMP_ROOT = path.join(process.cwd(), "tmp", "quote-reel-poster");
const IMAGE_ROOT = path.join(process.cwd(), "public", "assets", "images");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "PlayfairDisplay-Bold.ttf");

const POSTER_W = 1080;
const POSTER_H = 1920;

const ALLOWED_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Map the reel tone to the image mood folder that fits it best.
const TONE_IMAGE_FOLDER: Record<QuoteReelTone, string> = {
  aggressive: "luxury_success",
  cinematic: "urban_lonely",
  calm: "nostalgic",
  dark: "dark_mystery",
  emotional: "emotional",
  stoic: "stoic",
};

export type GenerateQuoteReelPosterInput = {
  tone: QuoteReelTone;
  /** Final narration script for the reel (used to ground the quote). */
  script?: string;
  /** Original topic / niche prompt, when the reel was AI-generated. */
  topic?: string;
};

export type GenerateQuoteReelPosterResult = {
  posterPath: string;
  quote: string;
  imageCategory: string;
  cleanupPaths: string[];
};

function ensureDir(dir: string) {
  return fs.mkdir(dir, { recursive: true });
}

function runFfmpeg(args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ffmpeg ${args.join(" ")}`);

    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[${logPrefix}] ffmpeg exited with ${code}\n${stderr}`));
    });
  });
}

async function listImagesInFolder(folder: string): Promise<string[]> {
  const dir = path.join(IMAGE_ROOT, folder);

  let dirents: Array<import("fs").Dirent> = [];
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return dirents
    .filter(
      (dirent) =>
        dirent.isFile() && ALLOWED_IMAGE_EXT.has(path.extname(dirent.name).toLowerCase()),
    )
    .map((dirent) => path.join(dir, dirent.name));
}

async function listAllImages(): Promise<string[]> {
  let dirents: Array<import("fs").Dirent> = [];
  try {
    dirents = await fs.readdir(IMAGE_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    results.push(...(await listImagesInFolder(dirent.name)));
  }

  return results;
}

async function pickBackgroundImage(tone: QuoteReelTone): Promise<{
  imagePath: string;
  imageCategory: string;
}> {
  const preferredFolder = TONE_IMAGE_FOLDER[tone] ?? "dark_mystery";

  const preferred = await listImagesInFolder(preferredFolder);
  const pool = preferred.length ? preferred : await listAllImages();

  if (!pool.length) {
    throw new Error("No poster background images found in public/assets/images");
  }

  const imagePath = pool[Math.floor(Math.random() * pool.length)];
  const imageCategory = path.basename(path.dirname(imagePath));

  return { imagePath, imageCategory };
}

async function generatePosterQuote(input: GenerateQuoteReelPosterInput): Promise<string> {
  const grounding = [
    input.topic ? `Topic / niche: ${input.topic}` : "",
    input.script ? `Reel script:\n${input.script}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You write a single short, standalone quote for a vertical TikTok quote poster.

Rules:
- ONE quote only, max 90 characters, ideally 40-75.
- It must read powerfully on its own, with no surrounding context.
- Match the requested emotional tone.
- No hashtags, no emojis, no surrounding quotation marks, no author attribution.
- Plain text only. Avoid clichés where possible; aim for something that makes people stop scrolling.
- Return strict JSON: {"quote": "..."}`,
      },
      {
        role: "user",
        content: `Tone: ${input.tone}\n\n${grounding || "General motivational / reflective theme."}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned empty content for poster quote");

  let quote = "";
  try {
    const parsed = JSON.parse(raw) as { quote?: unknown };
    quote = typeof parsed.quote === "string" ? parsed.quote.trim() : "";
  } catch {
    quote = raw.replace(/^["']|["']$/g, "").trim();
  }

  // Strip stray wrapping quotes the model may add anyway.
  quote = quote.replace(/^[""'"]+|[""'"]+$/g, "").trim();

  if (!quote) throw new Error("Could not derive a poster quote");

  return quote;
}

// Greedy word wrap into lines no longer than maxChars (keeps long words intact).
function wrapQuote(quote: string, maxChars: number): string[] {
  const words = quote.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

// Pick a font size + wrapping that keeps the quote readable and balanced.
function layoutQuote(quote: string): { lines: string[]; fontSize: number; lineHeight: number } {
  const length = quote.length;

  // Shorter quotes get larger type; longer quotes wrap tighter.
  const maxChars = length <= 45 ? 16 : length <= 70 ? 20 : 24;
  const lines = wrapQuote(quote, maxChars);

  const fontSize = lines.length <= 2 ? 84 : lines.length === 3 ? 76 : lines.length === 4 ? 66 : 58;

  return { lines, fontSize, lineHeight: Math.round(fontSize * 1.34) };
}

export async function generateQuoteReelPoster(
  input: GenerateQuoteReelPosterInput,
): Promise<GenerateQuoteReelPosterResult> {
  await ensureDir(TMP_ROOT);

  const workspaceRoot = path.join(TMP_ROOT, randomUUID());
  await ensureDir(workspaceRoot);

  const cleanupPaths: string[] = [workspaceRoot];

  try {
    const quote = await generatePosterQuote(input);
    const { imagePath, imageCategory } = await pickBackgroundImage(input.tone);

    const { lines, fontSize, lineHeight } = layoutQuote(quote);

    const blockHeight = lines.length * lineHeight;
    const startY = Math.round((POSTER_H - blockHeight) / 2);

    // One drawtext per line (via textfile) for true per-line centering and to
    // avoid any escaping issues with punctuation in the quote.
    const drawtextParts: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const lineFilePath = path.join(workspaceRoot, `line-${i}.txt`);
      await fs.writeFile(lineFilePath, lines[i], "utf8");

      const y = startY + i * lineHeight;
      drawtextParts.push(
        `drawtext=fontfile='${FONT_PATH}':textfile='${lineFilePath}':` +
          `fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}:` +
          `shadowcolor=black@0.7:shadowx=2:shadowy=3`,
      );
    }

    const filter = [
      `scale=${POSTER_W}:${POSTER_H}:force_original_aspect_ratio=increase,crop=${POSTER_W}:${POSTER_H}`,
      "eq=brightness=-0.10:saturation=1.05",
      `drawbox=x=0:y=0:w=${POSTER_W}:h=${POSTER_H}:color=black@0.40:t=fill`,
      "vignette=angle=PI/4.2",
      ...drawtextParts,
    ].join(",");

    const posterPath = path.join(workspaceRoot, "poster.jpg");

    await runFfmpeg(
      ["-y", "-i", imagePath, "-vf", filter, "-frames:v", "1", "-q:v", "2", posterPath],
      "quoteReelPoster:render",
    );

    return { posterPath, quote, imageCategory, cleanupPaths };
  } catch (error) {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
