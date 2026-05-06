// src/server/routes/quoteReel.ts
import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";

import type {
  CaptionStyle,
  Job,
  QuoteReelCaptionPreset,
  QuoteReelMode,
  QuoteReelTone,
  QuoteReelVoicePreset,
} from "@lib/jobsStore";
import { createJob } from "@lib/jobsRepo";
import { enqueueJob } from "@server/jobs/queue";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { requireUser } from "@server/auth/requireUser";
import { supabaseAdmin } from "@server/supabaseAdmin";

const ALLOWED_TONES: QuoteReelTone[] = [
  "aggressive",
  "cinematic",
  "calm",
  "dark",
  "emotional",
  "stoic",
];

const ALLOWED_CAPTION_STYLES: CaptionStyle[] = [
  "boldYellow",
  "subtle",
  "karaoke",
];

const ALLOWED_VOICE_PRESETS: QuoteReelVoicePreset[] = [
  "dark_male",
  "storyteller",
  "soft_female",
  "motivational_male",
  "neutral",
];

const ALLOWED_QUOTE_REEL_CAPTION_PRESETS: QuoteReelCaptionPreset[] = [
  "card_bottom_karaoke",
  "card_center_word_by_word",
  "card_center_progressive_words",
  "card_center_premium_word",
  "card_bottom_premium_karaoke",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTextInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getDefaultQuoteReelCaptionPreset(): QuoteReelCaptionPreset {
  const value = process.env.QUOTE_REEL_CAPTION_PRESET?.trim();

  return ALLOWED_QUOTE_REEL_CAPTION_PRESETS.includes(
      value as QuoteReelCaptionPreset,
    )
    ? (value as QuoteReelCaptionPreset)
    : "card_bottom_karaoke";
}

export async function registerQuoteReelRoute(app: FastifyInstance) {
  app.post("/api/quote-reel", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as Record<string, unknown>;

    const rawText = normalizeTextInput(body.text);
    const rawPrompt = normalizeTextInput(body.prompt);
    const rawMode = normalizeTextInput(body.mode) as QuoteReelMode | "";

    let mode: QuoteReelMode;

    if (rawMode === "manual_text" || rawMode === "ai_text") {
      mode = rawMode;
    } else if (rawText.length > 0) {
      mode = "manual_text";
    } else {
      mode = "ai_text";
    }

    if (mode === "manual_text" && !rawText) {
      return reply.code(400).send({
        error: "Missing text for manual_text mode",
      });
    }

    if (mode === "ai_text" && !rawPrompt) {
      return reply.code(400).send({
        error: "Missing prompt for ai_text mode",
      });
    }

    const rawTone = normalizeTextInput(body.tone) as QuoteReelTone | "";
    const tone: QuoteReelTone = ALLOWED_TONES.includes(rawTone as QuoteReelTone)
      ? (rawTone as QuoteReelTone)
      : "cinematic";

    const captionsEnabled = typeof body.captionsEnabled === "boolean"
      ? body.captionsEnabled
      : true;

    const rawCaptionStyle = normalizeTextInput(body.captionStyle) as
      | CaptionStyle
      | "";
    const captionStyle: CaptionStyle = ALLOWED_CAPTION_STYLES.includes(
        rawCaptionStyle as CaptionStyle,
      )
      ? (rawCaptionStyle as CaptionStyle)
      : "karaoke";

    const rawCaptionPreset = normalizeTextInput(body.captionPreset) as
      | QuoteReelCaptionPreset
      | "";
    const captionPreset: QuoteReelCaptionPreset =
      ALLOWED_QUOTE_REEL_CAPTION_PRESETS.includes(
          rawCaptionPreset as QuoteReelCaptionPreset,
        )
        ? (rawCaptionPreset as QuoteReelCaptionPreset)
        : getDefaultQuoteReelCaptionPreset();

    const voiceEnabled = typeof body.voiceEnabled === "boolean"
      ? body.voiceEnabled
      : true;

    const rawVoicePreset = normalizeTextInput(body.voicePreset) as
      | QuoteReelVoicePreset
      | "";
    const voicePreset: QuoteReelVoicePreset = ALLOWED_VOICE_PRESETS.includes(
        rawVoicePreset as QuoteReelVoicePreset,
      )
      ? (rawVoicePreset as QuoteReelVoicePreset)
      : "storyteller";

    const targetDurationSecRaw = Number(body.targetDurationSec ?? 70);
    const minDurationSecRaw = Number(body.minDurationSec ?? 60);
    const maxDurationSecRaw = Number(body.maxDurationSec ?? 95);

    const targetDurationSec = Number.isFinite(targetDurationSecRaw)
      ? clamp(targetDurationSecRaw, 45, 180)
      : 70;

    const minDurationSec = Number.isFinite(minDurationSecRaw)
      ? clamp(minDurationSecRaw, 45, 180)
      : 60;

    const maxDurationSec = Number.isFinite(maxDurationSecRaw)
      ? clamp(maxDurationSecRaw, 50, 240)
      : 95;

    if (minDurationSec > maxDurationSec) {
      return reply.code(400).send({
        error: "minDurationSec cannot be greater than maxDurationSec",
      });
    }

    const estimatedDurationForLimits = Math.max(
      targetDurationSec,
      minDurationSec,
      60,
    );

    const limit = await enforceJobLimits(user.id, {
      clipDurationSec: estimatedDurationForLimits,
      maxClips: 1,
      aspect: "vertical",
      jobGoal: "quote_reel",
      summaryTargetSec: estimatedDurationForLimits,
    });

    if (!limit.ok) {
      return reply.code(402).send({
        error: limit.reason,
        upgradeRequired: true,
      });
    }

    const now = new Date().toISOString();
    const source = mode === "manual_text"
      ? "quote_reel:text"
      : `quote_reel:prompt:${rawPrompt}`;

    const job: Job = {
      id: randomUUID(),
      ownerId: user.id,
      type: "quote_reel",
      source,
      status: "pending",
      createdAt: now,
      updatedAt: now,

      aspect: "vertical",
      captionsEnabled,
      captionStyle,

      jobGoal: "quote_reel",
      clips: [],
      captionedClips: [],
      captionedThumbs: [],
      stage: "queued",
      progress: 0,
      reviewReady: false,

      quotePrompt: mode === "ai_text" ? rawPrompt : undefined,
      quoteReelMeta: {
        mode,
        tone,
        sourceText: mode === "manual_text" ? rawText : undefined,
        targetDurationSec,
        minDurationSec,
        maxDurationSec,
        captionsEnabled,
        captionStyle,
        captionPreset,
        voiceEnabled,
        voicePreset,
        musicSuggestions: [],
        voiceover: {
          enabled: voiceEnabled,
          voicePreset,
        },
      },
    };

    await createJob(job, supabaseAdmin());
    await enqueueJob(job);

    return reply.code(201).send({ job });
  });
}
