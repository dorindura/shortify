import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

export type TextOverlayPosition = "top" | "center" | "bottom";
export type OverlayEmojiPlacement = "left" | "right";

export type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
  emoji?: string | null;
  emojiPlacement?: OverlayEmojiPlacement;
};

const TMP_OVERLAYS_DIR = path.join(process.cwd(), "tmp", "overlay-assets");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function escapeXml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeText(text: string): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function getEmojiAssetPath(emojiId?: string | null): string | null {
  if (!emojiId) return null;

  const match = OVERLAY_EMOJIS.find((emoji) => emoji.id === emojiId);
  if (!match) return null;

  return path.join(process.cwd(), "public", "emoji", match.assetFile);
}

function estimateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;

  let width = 0;

  for (const ch of text) {
    if (ch === " ") width += fontSize * 0.3;
    else if ("ilI.,'|!".includes(ch)) width += fontSize * 0.26;
    else if ("mwMW@#%&".includes(ch)) width += fontSize * 0.88;
    else width += fontSize * 0.56;
  }

  return Math.ceil(width);
}

export async function createOverlayAsset(overlay: TextOverlay): Promise<string | null> {
  const text = normalizeText(overlay.text);
  const emojiPath = getEmojiAssetPath(overlay.emoji);
  const placement = overlay.emojiPlacement ?? "left";

  if (!text && !emojiPath) return null;

  await ensureDir(TMP_OVERLAYS_DIR);

  const outPath = path.join(TMP_OVERLAYS_DIR, `${randomUUID()}.png`);

  const fontSize = 40;
  const strokeWidth = 3;
  const emojiSize = 62;
  const gap = 10;
  const padX = 28;
  const padY = 18;

  const hasText = !!text;
  const hasEmoji = !!emojiPath;

  const textWidth = hasText ? estimateTextWidth(text, fontSize) + strokeWidth * 8 : 0;
  const textHeight = hasText ? Math.ceil(fontSize * 1.25) : 0;

  const emojiWidth = hasEmoji ? emojiSize : 0;
  const emojiHeight = hasEmoji ? emojiSize : 0;

  const contentWidth =
    (hasEmoji ? emojiWidth : 0) + (hasText && hasEmoji ? gap : 0) + (hasText ? textWidth : 0);

  const contentHeight = Math.max(textHeight, emojiHeight, fontSize);

  const width = Math.max(1, contentWidth + padX * 2);
  const height = Math.max(1, contentHeight + padY * 2);

  let currentX = Math.round((width - contentWidth) / 2);

  let emojiSvg = "";
  let textSvg = "";

  const textY = Math.round(height / 2 + fontSize * 0.32);
  const emojiY = Math.round((height - emojiSize) / 2);

  if (hasEmoji && placement === "left" && emojiPath) {
    const emojiBuffer = await fs.readFile(emojiPath);
    const emojiBase64 = emojiBuffer.toString("base64");

    emojiSvg = `
      <image
        href="data:image/png;base64,${emojiBase64}"
        x="${currentX}"
        y="${emojiY}"
        width="${emojiSize}"
        height="${emojiSize}"
      />
    `;

    currentX += emojiSize + (hasText ? gap : 0);
  }

  if (hasText) {
    textSvg = `
      <text
        x="${currentX}"
        y="${textY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#ffffff"
        stroke="rgba(0,0,0,0.88)"
        stroke-width="${strokeWidth}"
        paint-order="stroke fill"
      >
        ${escapeXml(text)}
      </text>
    `;

    currentX += textWidth + (hasEmoji && placement === "right" ? gap : 0);
  }

  if (hasEmoji && placement === "right" && emojiPath) {
    const emojiBuffer = await fs.readFile(emojiPath);
    const emojiBase64 = emojiBuffer.toString("base64");

    emojiSvg += `
      <image
        href="data:image/png;base64,${emojiBase64}"
        x="${currentX}"
        y="${emojiY}"
        width="${emojiSize}"
        height="${emojiSize}"
      />
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${placement === "left" ? `${emojiSvg}${textSvg}` : `${textSvg}${emojiSvg}`}
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(outPath);

  return outPath;
}
