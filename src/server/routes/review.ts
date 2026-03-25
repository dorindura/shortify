import { FastifyInstance } from "fastify";
import { requireUser } from "@server/auth/requireUser";
import {
  dbGetJob,
  dbSetJobCaptionDrafts,
  dbSetJobReviewReady,
  dbSetJobTextOverlays,
  dbUpdateJob,
} from "@server/jobs/jobsDb";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

type CaptionStyle = "boldYellow" | "subtle" | "karaoke";
type TextOverlayPosition = "top" | "center" | "bottom";

type CaptionDraftWord = {
  text: string;
  startSec: number;
  endSec: number;
};

type CaptionDraftChunk = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words?: CaptionDraftWord[];
};

type CaptionDraftClip = {
  clipIndex: number;
  chunks: CaptionDraftChunk[];
};

type OverlayEmojiPlacement = "left" | "right";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
  emoji?: string | null;
  emojiPlacement: OverlayEmojiPlacement;
};

type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";

type EndingPosition = "top" | "center" | "bottom";
type EndingEmojiPlacement = "left" | "right" | "center";

type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  durationSec?: number;
  emoji?: string;
  emojiPlacement?: EndingEmojiPlacement;
  position?: EndingPosition;
};

function isCaptionStyle(value: unknown): value is CaptionStyle {
  return value === "boldYellow" || value === "subtle" || value === "karaoke";
}

function isOverlayPosition(value: unknown): value is TextOverlayPosition {
  return value === "top" || value === "center" || value === "bottom";
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOverlayEmojiPlacement(value: unknown): value is OverlayEmojiPlacement {
  return value === "left" || value === "right";
}

function isOverlayEmoji(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return OVERLAY_EMOJIS.some((emoji) => emoji.id === value);
}

function sanitizeCaptionDrafts(input: unknown): CaptionDraftClip[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((clipRaw) => {
      const clipIndex = Number((clipRaw as any)?.clipIndex);
      if (!Number.isInteger(clipIndex) || clipIndex < 0) return null;

      const rawChunks = Array.isArray((clipRaw as any)?.chunks) ? (clipRaw as any).chunks : [];

      const chunks = rawChunks
        .map((chunkRaw: any) => {
          const id = normalizeText(chunkRaw?.id);
          const text = normalizeText(chunkRaw?.text);
          const startSec = Number(chunkRaw?.startSec);
          const endSec = Number(chunkRaw?.endSec);

          if (!id) return null;
          if (!text) return null;
          if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
            return null;
          }
          if (endSec <= startSec) return null;

          const words = Array.isArray(chunkRaw?.words)
            ? chunkRaw.words
                .map((wordRaw: any) => {
                  const wordText = normalizeText(wordRaw?.text);
                  const wordStartSec = Number(wordRaw?.startSec);
                  const wordEndSec = Number(wordRaw?.endSec);

                  if (!wordText) return null;
                  if (!Number.isFinite(wordStartSec) || !Number.isFinite(wordEndSec)) return null;
                  if (wordEndSec <= wordStartSec) return null;

                  return {
                    text: wordText,
                    startSec: wordStartSec,
                    endSec: wordEndSec,
                  };
                })
                .filter(Boolean)
            : undefined;

          return {
            id,
            text,
            startSec,
            endSec,
            words: words?.length ? words : undefined,
          };
        })
        .filter(Boolean);

      return {
        clipIndex,
        chunks,
      };
    })
    .filter(Boolean) as CaptionDraftClip[];
}

function sanitizeTextOverlays(input: unknown): TextOverlay[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((overlayRaw: any) => {
      const id = normalizeText(overlayRaw?.id);
      const text = normalizeText(overlayRaw?.text);
      const clipIndex = Number(overlayRaw?.clipIndex);
      const startSec = Number(overlayRaw?.startSec);
      const endSec = Number(overlayRaw?.endSec);
      const position = overlayRaw?.position;

      const emojiRaw = overlayRaw?.emoji;
      const emojiPlacementRaw = overlayRaw?.emojiPlacement;

      const emoji = isOverlayEmoji(emojiRaw) ? emojiRaw : null;
      const emojiPlacement = isOverlayEmojiPlacement(emojiPlacementRaw)
        ? emojiPlacementRaw
        : "left";

      if (!id || !text) return null;
      if (!Number.isInteger(clipIndex) || clipIndex < 0) return null;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
      if (endSec <= startSec) return null;
      if (!isOverlayPosition(position)) return null;

      return {
        id,
        text,
        clipIndex,
        startSec,
        endSec,
        position,
        emoji,
        emojiPlacement,
      };
    })
    .filter(Boolean) as TextOverlay[];
}

function isEndingType(value: unknown): value is EndingType {
  return value === "none" || value === "freeze" || value === "fadeBlack" || value === "endCard";
}

function isEndingPosition(value: unknown): value is EndingPosition {
  return value === "top" || value === "center" || value === "bottom";
}

function isEndingEmojiPlacement(value: unknown): value is EndingEmojiPlacement {
  return value === "left" || value === "right" || value === "center";
}

function isEndingEmoji(value: unknown): value is string {
  if (typeof value !== "string") return false;

  return OVERLAY_EMOJIS.some((emoji) => emoji.id === value || emoji.char === value);
}
function sanitizeEnding(input: unknown): EndingConfig | null {
  if (!input || typeof input !== "object") return null;

  const raw = input as any;
  const type = raw?.type;

  if (!isEndingType(type)) return null;

  const text = normalizeText(raw?.text);
  const subtext = normalizeText(raw?.subtext);

  const durationRaw = Number(raw?.durationSec);
  const durationSec = Number.isFinite(durationRaw) ? Math.max(0.5, Math.min(3, durationRaw)) : 1.2;

  const emoji = isEndingEmoji(raw?.emoji) ? raw.emoji : undefined;
  const emojiPlacement = isEndingEmojiPlacement(raw?.emojiPlacement) ? raw.emojiPlacement : "right";
  const position = isEndingPosition(raw?.position) ? raw.position : "bottom";

  return {
    type,
    text: text || undefined,
    subtext: subtext || undefined,
    durationSec,
    emoji,
    emojiPlacement,
    position,
  };
}

export async function registerJobReviewRoute(app: FastifyInstance) {
  app.post("/api/jobs/:jobId/review", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const jobId = String((req.params as any)?.jobId ?? "");
    if (!jobId) {
      return reply.code(400).send({ error: "Missing jobId" });
    }

    const job = await dbGetJob(jobId);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    if (job.owner_id !== user.id) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    if (job.job_goal !== "shorts") {
      return reply.code(400).send({
        error: "Review is available only for shorts jobs",
      });
    }

    const body = (req.body ?? {}) as any;

    const captionDrafts = sanitizeCaptionDrafts(body.captionDrafts);
    const textOverlays = sanitizeTextOverlays(body.textOverlays);
    const ending = sanitizeEnding(body.ending);

    const patch: Record<string, any> = {};

    if ("captionStyle" in body) {
      if (!isCaptionStyle(body.captionStyle)) {
        return reply.code(400).send({ error: "Invalid captionStyle" });
      }
      patch.caption_style = body.captionStyle;
    }

    if ("captionsEnabled" in body) {
      patch.captions_enabled = Boolean(body.captionsEnabled);
    }

    if ("blackAndWhite" in body) {
      patch.black_and_white = Boolean(body.blackAndWhite);
    }

    if ("ending" in body) {
      patch.ending = ending;
    }

    await dbSetJobCaptionDrafts(jobId, captionDrafts);
    await dbSetJobTextOverlays(jobId, textOverlays);

    if (Object.keys(patch).length > 0) {
      await dbUpdateJob(jobId, patch);
    }

    await dbSetJobReviewReady(jobId, true);

    const updated = await dbGetJob(jobId);

    return reply.code(200).send({
      ok: true,
      job: updated,
    });
  });
}
