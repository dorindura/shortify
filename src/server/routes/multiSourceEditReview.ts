import { FastifyInstance } from "fastify";
import { requireUser } from "@server/auth/requireUser";
import { dbGetJob, dbSetJobReviewReady, dbSetMultiSourceReviewConfig } from "@server/jobs/jobsDb";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

type OverlayPosition = "top" | "center" | "bottom";
type EmojiPlacement = "left" | "right";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOverlayPosition(value: unknown): value is OverlayPosition {
  return value === "top" || value === "center" || value === "bottom";
}

function isEmojiPlacement(value: unknown): value is EmojiPlacement {
  return value === "left" || value === "right";
}

function isEmoji(value: unknown): value is string {
  return typeof value === "string" && OVERLAY_EMOJIS.some((emoji) => emoji.id === value);
}

function sanitizeTextOverlays(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((overlay: any) => {
      const id = normalizeText(overlay?.id);
      const text = normalizeText(overlay?.text);
      const startSec = Number(overlay?.startSec);
      const endSec = Number(overlay?.endSec);
      const position = overlay?.position;
      const emoji = isEmoji(overlay?.emoji) ? overlay.emoji : null;
      const emojiPlacement = isEmojiPlacement(overlay?.emojiPlacement)
        ? overlay.emojiPlacement
        : "left";

      if (!id || !text) return null;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
      if (endSec <= startSec) return null;
      if (!isOverlayPosition(position)) return null;

      return {
        id,
        text,
        startSec,
        endSec,
        position,
        emoji,
        emojiPlacement,
      };
    })
    .filter(Boolean);
}

function sanitizeBlackWhiteRanges(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((range: any) => {
      const id = normalizeText(range?.id);
      const startSec = Number(range?.startSec);
      const endSec = Number(range?.endSec);

      if (!id) return null;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
      if (endSec <= startSec) return null;

      return {
        id,
        startSec,
        endSec,
      };
    })
    .filter(Boolean);
}

function sanitizeEnding(input: unknown) {
  if (!input || typeof input !== "object") return null;

  const raw = input as any;
  const type = raw?.type;

  if (!["none", "freeze", "fadeBlack", "endCard"].includes(type)) {
    return null;
  }

  const durationRaw = Number(raw?.durationSec);
  const durationSec = Number.isFinite(durationRaw) ? Math.max(0.5, Math.min(3, durationRaw)) : 1.2;

  const text = normalizeText(raw?.text);
  const subtext = normalizeText(raw?.subtext);

  const emoji =
    typeof raw?.emoji === "string" &&
    OVERLAY_EMOJIS.some((item) => item.id === raw.emoji || item.char === raw.emoji)
      ? raw.emoji
      : undefined;

  const emojiPlacement =
    raw?.emojiPlacement === "left" ||
    raw?.emojiPlacement === "right" ||
    raw?.emojiPlacement === "center"
      ? raw.emojiPlacement
      : "right";

  const position =
    raw?.position === "top" || raw?.position === "center" || raw?.position === "bottom"
      ? raw.position
      : "bottom";

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

export async function registerMultiSourceEditReviewRoute(app: FastifyInstance) {
  app.post("/api/multi-source-edit/:jobId/review", async (req, reply) => {
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

    if (job.job_goal !== "multi_source_edit") {
      return reply.code(400).send({ error: "Review is available only for multi_source_edit jobs" });
    }

    if (!job.multi_source_edit_config?.draftVideoUrl) {
      return reply.code(400).send({ error: "Draft video is not ready yet" });
    }

    const body = (req.body ?? {}) as any;

    const reviewConfig = {
      textOverlays: sanitizeTextOverlays(body.textOverlays),
      blackWhiteRanges: sanitizeBlackWhiteRanges(body.blackWhiteRanges),
      ending: sanitizeEnding(body.ending),
    };

    await dbSetMultiSourceReviewConfig(jobId, reviewConfig);
    await dbSetJobReviewReady(jobId, true);

    const updated = await dbGetJob(jobId);

    return reply.code(200).send({
      ok: true,
      job: updated,
    });
  });
}
