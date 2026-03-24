import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

export type EndingType = "none" | "freeze";
export type EndingPosition = "top" | "center" | "bottom";
export type EndingEmojiPlacement = "left" | "right" | "center";

export type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  emoji?: string;
  emojiPlacement?: EndingEmojiPlacement;
  position?: EndingPosition;
  durationSec?: number;
};

const TMP_ENDINGS_DIR = path.join(process.cwd(), "tmp", "ending-assets");

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

function getEmojiAssetPath(emojiValue?: string | null): string | null {
  if (!emojiValue) return null;

  const byId = OVERLAY_EMOJIS.find((emoji) => emoji.id === emojiValue);
  if (byId) {
    return path.join(process.cwd(), "public", "emoji", byId.assetFile);
  }

  const byChar = OVERLAY_EMOJIS.find((emoji) => emoji.char === emojiValue);
  if (byChar) {
    return path.join(process.cwd(), "public", "emoji", byChar.assetFile);
  }

  return null;
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

type EndingLineParts = {
  leftEmoji: boolean;
  rightEmoji: boolean;
  centerEmojiOnly: boolean;
  text: string;
};

function buildMainLineParts(ending: EndingConfig): EndingLineParts {
  const text = normalizeText(ending.text);
  const hasEmoji = !!ending.emoji;

  if (!hasEmoji) {
    return {
      leftEmoji: false,
      rightEmoji: false,
      centerEmojiOnly: false,
      text,
    };
  }

  if (!text) {
    return {
      leftEmoji: false,
      rightEmoji: false,
      centerEmojiOnly: true,
      text: "",
    };
  }

  switch (ending.emojiPlacement) {
    case "left":
      return {
        leftEmoji: true,
        rightEmoji: false,
        centerEmojiOnly: false,
        text,
      };

    case "center":
      return {
        leftEmoji: true,
        rightEmoji: true,
        centerEmojiOnly: false,
        text,
      };

    case "right":
    default:
      return {
        leftEmoji: false,
        rightEmoji: true,
        centerEmojiOnly: false,
        text,
      };
  }
}

export async function createEndingAsset(ending: EndingConfig): Promise<string | null> {
  const text = normalizeText(ending.text);
  const subtext = normalizeText(ending.subtext);
  const emojiPath = getEmojiAssetPath(ending.emoji);

  if (!text && !subtext && !emojiPath) return null;

  await ensureDir(TMP_ENDINGS_DIR);

  const outPath = path.join(TMP_ENDINGS_DIR, `${randomUUID()}.png`);

  const mainFontSize = 64;
  const subFontSize = 30;
  const mainStrokeWidth = 3;
  const subStrokeWidth = 2;

  const emojiSize = 82;
  const emojiGap = 10;
  const lineGap = 14;

  const padX = 26;
  const padY = 22;

  const mainLine = buildMainLineParts(ending);

  const hasEmoji = !!emojiPath;
  const hasMainText = !!mainLine.text;
  const hasSubtext = !!subtext;

  const mainTextWidth = hasMainText ? estimateTextWidth(mainLine.text, mainFontSize) : 0;
  const subTextWidth = hasSubtext ? estimateTextWidth(subtext, subFontSize) : 0;

  const leftEmojiWidth =
    hasEmoji && (mainLine.leftEmoji || mainLine.centerEmojiOnly) ? emojiSize : 0;
  const rightEmojiWidth = hasEmoji && mainLine.rightEmoji ? emojiSize : 0;

  const mainLineWidth = mainLine.centerEmojiOnly
    ? emojiSize
    : leftEmojiWidth +
      (leftEmojiWidth && hasMainText ? emojiGap : 0) +
      mainTextWidth +
      (rightEmojiWidth && hasMainText ? emojiGap : 0) +
      rightEmojiWidth;

  const mainLineHeight = Math.max(
    hasMainText ? Math.ceil(mainFontSize * 1.25) : 0,
    leftEmojiWidth ? emojiSize : 0,
    rightEmojiWidth ? emojiSize : 0,
    mainLine.centerEmojiOnly ? emojiSize : 0,
  );

  const subLineHeight = hasSubtext ? Math.ceil(subFontSize * 1.25) : 0;

  const contentWidth = Math.max(mainLineWidth, subTextWidth, 1);
  const contentHeight = mainLineHeight + (hasSubtext ? lineGap + subLineHeight : 0);

  const width = Math.max(1, contentWidth + padX * 2);
  const height = Math.max(1, contentHeight + padY * 2);

  const svgParts: string[] = [];

  const contentLeft = Math.round((width - contentWidth) / 2);
  const mainTop = padY;
  const subTop = mainTop + mainLineHeight + (hasSubtext ? lineGap : 0);

  let currentX = contentLeft;

  if (emojiPath) {
    const emojiBuffer = await fs.readFile(emojiPath);
    const emojiBase64 = emojiBuffer.toString("base64");

    const emojiY = Math.round(mainTop + (mainLineHeight - emojiSize) / 2);

    if (mainLine.centerEmojiOnly) {
      const x = Math.round((width - emojiSize) / 2);
      svgParts.push(`
        <image
          href="data:image/png;base64,${emojiBase64}"
          x="${x}"
          y="${emojiY}"
          width="${emojiSize}"
          height="${emojiSize}"
        />
      `);
    } else {
      if (mainLine.leftEmoji) {
        svgParts.push(`
          <image
            href="data:image/png;base64,${emojiBase64}"
            x="${currentX}"
            y="${emojiY}"
            width="${emojiSize}"
            height="${emojiSize}"
          />
        `);
        currentX += emojiSize + (hasMainText ? emojiGap : 0);
      }

      if (hasMainText) {
        const textY = Math.round(mainTop + mainLineHeight / 2 + mainFontSize * 0.32);

        svgParts.push(`
          <text
            x="${currentX}"
            y="${textY}"
            font-family="Arial, Helvetica, sans-serif"
            font-size="${mainFontSize}"
            font-weight="700"
            fill="#ffffff"
            stroke="rgba(0,0,0,0.88)"
            stroke-width="${mainStrokeWidth}"
            paint-order="stroke fill"
          >
            ${escapeXml(mainLine.text)}
          </text>
        `);

        currentX += mainTextWidth + (mainLine.rightEmoji ? emojiGap : 0);
      }

      if (mainLine.rightEmoji) {
        svgParts.push(`
          <image
            href="data:image/png;base64,${emojiBase64}"
            x="${currentX}"
            y="${emojiY}"
            width="${emojiSize}"
            height="${emojiSize}"
          />
        `);
      }
    }
  } else if (hasMainText) {
    const textX = Math.round((width - mainTextWidth) / 2);
    const textY = Math.round(mainTop + mainLineHeight / 2 + mainFontSize * 0.32);

    svgParts.push(`
      <text
        x="${textX}"
        y="${textY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${mainFontSize}"
        font-weight="700"
        fill="#ffffff"
        stroke="rgba(0,0,0,0.88)"
        stroke-width="${mainStrokeWidth}"
        paint-order="stroke fill"
      >
        ${escapeXml(mainLine.text)}
      </text>
    `);
  }

  if (hasSubtext) {
    const subX = Math.round((width - subTextWidth) / 2);
    const subY = Math.round(subTop + subLineHeight / 2 + subFontSize * 0.32);

    svgParts.push(`
      <text
        x="${subX}"
        y="${subY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${subFontSize}"
        font-weight="600"
        fill="#e2e8f0"
        stroke="rgba(0,0,0,0.70)"
        stroke-width="${subStrokeWidth}"
        paint-order="stroke fill"
      >
        ${escapeXml(subtext)}
      </text>
    `);
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${svgParts.join("\n")}
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(outPath);

  return outPath;
}
