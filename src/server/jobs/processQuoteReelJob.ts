import path from "path";
import {
  dbGetJob,
  dbSetJobCaptionDrafts,
  dbSetJobCaptionedResults,
  dbSetJobReviewReady,
  dbUpdateJobQuoteMeta,
  dbUpdateJobStage,
  dbUpdateJobStatus,
} from "@/server/jobs/jobsDb";
import { uploadLocalFileToStorage } from "@/server/storage/upload";
import { cleanupLocalJobArtifacts } from "@/server/storage/cleanup";
import {
  buildQuoteReelPlanFromFinalScript,
  generateQuoteReelScriptPlan,
} from "@/server/ai/quoteReelScriptGenerator";
import { pickAssetsForQuoteReelSegments } from "@/server/assets/quoteReelVideoAssets";
import { generateVoiceoverFromText } from "@/server/ai/elevenLabsVoiceover";
import { assembleQuoteReel } from "@/server/video/quoteReelAssembly";
import {
  type CaptionDraftClip,
  generateCaptionDraftsForAudioFiles,
  generateCaptionDraftsForClips,
  generateSubtitlesFromDrafts,
} from "@/server/video/caption";
import { renderShortsWithSubtitles } from "@/server/video/render";
import type {
  CaptionStyle,
  QuoteReelCaptionPreset,
  QuoteReelMeta,
  QuoteReelMode,
  QuoteReelTone,
  QuoteReelVoicePreset,
} from "@/lib/jobsStore";

type SubtitleFile = string | { path: string };

function isQuoteReelCaptionPreset(value: unknown): value is QuoteReelCaptionPreset {
  return (
    value === "card_bottom_karaoke" ||
    value === "card_center_word_by_word" ||
    value === "card_center_progressive_words" ||
    value === "card_center_premium_word" ||
    value === "card_bottom_premium_karaoke"
  );
}

function subtitleToPath(s: SubtitleFile): string {
  return typeof s === "string" ? s : s.path;
}

function toLocalAssetPath(assetPath: string): string {
  if (!assetPath) return assetPath;

  if (assetPath.startsWith("/shorts/") || assetPath.startsWith("/thumbs/")) {
    return path.join(process.cwd(), "public", assetPath.replace(/^\/+/, ""));
  }

  return assetPath;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isCaptionStyle(value: unknown): value is CaptionStyle {
  return (
    value === "boldYellow" ||
    value === "subtle" ||
    value === "karaoke" ||
    value === "wordByWord" ||
    value === "progressiveWords"
  );
}

function isQuoteReelMode(value: unknown): value is QuoteReelMode {
  return value === "manual_text" || value === "ai_text";
}

function isQuoteReelTone(value: unknown): value is QuoteReelTone {
  return (
    value === "aggressive" ||
    value === "cinematic" ||
    value === "calm" ||
    value === "dark" ||
    value === "emotional" ||
    value === "stoic"
  );
}

function isQuoteReelVoicePreset(value: unknown): value is QuoteReelVoicePreset {
  return (
    value === "dark_male" ||
    value === "storyteller" ||
    value === "soft_female" ||
    value === "motivational_male" ||
    value === "neutral"
  );
}

function getDefaultQuoteReelCaptionPreset(): QuoteReelCaptionPreset {
  const value = process.env.QUOTE_REEL_CAPTION_PRESET?.trim();

  return isQuoteReelCaptionPreset(value) ? value : "card_bottom_premium_karaoke";
}

export async function processQuoteReelJob(jobId: string) {
  const job = await dbGetJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.job_goal !== "quote_reel") {
    throw new Error(`Job ${jobId} is not quote_reel`);
  }

  const cleanupClipPaths: string[] = [];
  const cleanupAudioPaths: string[] = [];
  const cleanupSubtitlePaths: string[] = [];
  const cleanupExtraPaths: string[] = [];

  const existingMeta: QuoteReelMeta = (job.quote_reel_meta ?? {}) as QuoteReelMeta;

  try {
    await dbUpdateJobStatus(jobId, "processing");
    await dbUpdateJobStage(jobId, "planning", 8);

    const mode: QuoteReelMode = isQuoteReelMode(existingMeta.mode)
      ? existingMeta.mode
      : existingMeta.sourceText
        ? "manual_text"
        : "ai_text";

    const tone: QuoteReelTone = isQuoteReelTone(existingMeta.tone)
      ? existingMeta.tone
      : "cinematic";

    const captionStyle: CaptionStyle = isCaptionStyle(existingMeta.captionStyle)
      ? existingMeta.captionStyle
      : isCaptionStyle(job.caption_style)
        ? job.caption_style
        : "karaoke";

    const captionsEnabled =
      typeof existingMeta.captionsEnabled === "boolean"
        ? existingMeta.captionsEnabled
        : typeof job.captions_enabled === "boolean"
          ? job.captions_enabled
          : true;

    const voiceEnabled =
      typeof existingMeta.voiceEnabled === "boolean" ? existingMeta.voiceEnabled : true;

    const voicePreset: QuoteReelVoicePreset = isQuoteReelVoicePreset(existingMeta.voicePreset)
      ? existingMeta.voicePreset
      : isQuoteReelVoicePreset(existingMeta.voiceover?.voicePreset)
        ? (existingMeta.voiceover?.voicePreset as QuoteReelVoicePreset)
        : "storyteller";

    const captionPreset: QuoteReelCaptionPreset = isQuoteReelCaptionPreset(
      existingMeta.captionPreset,
    )
      ? existingMeta.captionPreset
      : getDefaultQuoteReelCaptionPreset();

    const targetDurationSec = clamp(Number(existingMeta.targetDurationSec ?? 70), 45, 180);
    const minDurationSec = clamp(Number(existingMeta.minDurationSec ?? 60), 45, 180);
    const maxDurationSec = clamp(Number(existingMeta.maxDurationSec ?? 95), 50, 240);

    const sourceText =
      typeof existingMeta.sourceText === "string" ? existingMeta.sourceText.trim() : "";
    const prompt = typeof job.quote_prompt === "string" ? job.quote_prompt.trim() : "";

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      mode,
      tone,
      captionsEnabled,
      captionStyle,
      captionPreset,
      voiceEnabled,
      voicePreset,
      voiceover: {
        ...(existingMeta.voiceover ?? {}),
        enabled: voiceEnabled,
        voicePreset,
      },
      targetDurationSec,
      minDurationSec,
      maxDurationSec,
    });

    await dbUpdateJobStage(jobId, "script_generation", 18);

    const scriptReviewRequired = existingMeta.scriptReviewRequired !== false;
    const scriptReviewApproved = existingMeta.scriptReviewApproved === true;

    const scriptPlan =
      scriptReviewApproved && typeof existingMeta.finalScript === "string"
        ? buildQuoteReelPlanFromFinalScript({
            finalScript: existingMeta.finalScript,
            tone,
            targetDurationSec,
            minDurationSec,
            maxDurationSec,
            addCta: true,
            sourceMode: mode,
            sourceText: existingMeta.sourceText,
            generatedText: existingMeta.generatedText,
            instagramCaption: existingMeta.instagramCaption,
            hashtags: existingMeta.hashtags,
            musicSuggestions: existingMeta.musicSuggestions,
          })
        : await generateQuoteReelScriptPlan({
            mode,
            tone,
            text: mode === "manual_text" ? sourceText : undefined,
            prompt: mode === "ai_text" ? prompt : undefined,
            targetDurationSec,
            minDurationSec,
            maxDurationSec,
            addCta: true,
          });

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      mode,
      tone,
      sourceText: scriptPlan.sourceText,
      generatedText: scriptPlan.generatedText,
      finalScript: scriptPlan.finalScript,
      originalFinalScript: existingMeta.originalFinalScript ?? scriptPlan.finalScript,
      scriptReviewRequired,
      scriptReviewApproved,
      scriptEdited: existingMeta.scriptEdited ?? false,
      targetDurationSec,
      minDurationSec,
      maxDurationSec,
      captionsEnabled,
      captionStyle,
      captionPreset,
      voiceEnabled,
      voicePreset,
      voiceover: {
        ...(existingMeta.voiceover ?? {}),
        enabled: voiceEnabled,
        voicePreset,
      },
      segments: scriptPlan.segments,
      instagramCaption: scriptPlan.instagramCaption,
      hashtags: scriptPlan.hashtags,
      musicSuggestions: scriptPlan.musicSuggestions,
      selectedAssets: [],
    });

    if (scriptReviewRequired && !scriptReviewApproved) {
      await dbSetJobReviewReady(jobId, true);
      await dbUpdateJobStage(jobId, "review_ready", 100);
      await dbUpdateJobStatus(jobId, "done");
      return;
    }

    await dbSetJobReviewReady(jobId, false);

    let voiceoverAudioPath: string | undefined;
    let actualTargetDurationSec = targetDurationSec;
    let voiceoverMetaPatch: QuoteReelMeta["voiceover"] = {
      ...(existingMeta.voiceover ?? {}),
      enabled: voiceEnabled,
      voicePreset,
    };

    if (voiceEnabled) {
      await dbUpdateJobStage(jobId, "voiceover", 34);

      const voiceover = await generateVoiceoverFromText({
        text: scriptPlan.finalScript,
        tone,
        voicePreset,
      });

      voiceoverAudioPath = voiceover.audioPath;
      cleanupAudioPaths.push(voiceover.audioPath);

      actualTargetDurationSec = clamp(
        Math.max(voiceover.durationSec, minDurationSec),
        minDurationSec,
        maxDurationSec,
      );

      voiceoverMetaPatch = {
        enabled: true,
        voicePreset: voiceover.voicePreset,
        voiceId: voiceover.voiceId,
        modelId: voiceover.modelId,
        audioPath: voiceover.audioPath,
        durationSec: voiceover.durationSec,
        captionDraft: voiceover.captionDraft,
      };

      await dbUpdateJobQuoteMeta(jobId, {
        ...existingMeta,
        mode,
        tone,
        sourceText: scriptPlan.sourceText,
        generatedText: scriptPlan.generatedText,
        finalScript: scriptPlan.finalScript,
        targetDurationSec,
        minDurationSec,
        maxDurationSec,
        actualDurationSec: voiceover.durationSec,
        captionsEnabled,
        captionStyle,
        captionPreset,
        voiceEnabled,
        voicePreset,
        segments: scriptPlan.segments,
        instagramCaption: scriptPlan.instagramCaption,
        hashtags: scriptPlan.hashtags,
        musicSuggestions: scriptPlan.musicSuggestions,
        selectedAssets: [],
        voiceover: voiceoverMetaPatch,
      });
    }

    await dbUpdateJobStage(jobId, "asset_selection", 48);

    const assetPicks = await pickAssetsForQuoteReelSegments({
      segments: scriptPlan.segments,
      tone,
    });

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      mode,
      tone,
      sourceText: scriptPlan.sourceText,
      generatedText: scriptPlan.generatedText,
      finalScript: scriptPlan.finalScript,
      targetDurationSec,
      minDurationSec,
      maxDurationSec,
      actualDurationSec: voiceoverMetaPatch?.durationSec ?? undefined,
      captionsEnabled,
      captionStyle,
      captionPreset,
      voiceEnabled,
      voicePreset,
      segments: scriptPlan.segments,
      selectedAssets: assetPicks,
      instagramCaption: scriptPlan.instagramCaption,
      hashtags: scriptPlan.hashtags,
      musicSuggestions: scriptPlan.musicSuggestions,
      voiceover: voiceoverMetaPatch,
    });

    await dbUpdateJobStage(jobId, "assembling", 62);

    const assembly = await assembleQuoteReel({
      aspect: "vertical",
      segments: scriptPlan.segments,
      assetPicks,
      voiceoverAudioPath,
      targetDurationSec: actualTargetDurationSec,
    });

    cleanupExtraPaths.push(...assembly.cleanupPaths);

    const baseVideoPath = assembly.finalVideoPath;
    const baseThumbPath = assembly.thumbPath;

    let captionDrafts: CaptionDraftClip[] = [];
    let finalVideoPath = baseVideoPath;
    let finalThumbPath = baseThumbPath;

    if (captionsEnabled) {
      await dbUpdateJobStage(jobId, "captioning", 76);

      captionDrafts = voiceoverMetaPatch?.captionDraft
        ? [voiceoverMetaPatch.captionDraft]
        : voiceoverAudioPath
          ? await generateCaptionDraftsForAudioFiles([voiceoverAudioPath])
          : await generateCaptionDraftsForClips([baseVideoPath]);

      await dbSetJobCaptionDrafts(jobId, captionDrafts);

      const subtitleFiles = await generateSubtitlesFromDrafts(captionDrafts, [baseVideoPath], {
        captionStyle,
        quoteReelCaptionPreset: captionPreset,
        fontName: process.env.QUOTE_REEL_CAPTION_FONT?.trim() || "Inter",
        captionOffsetSec: Number(process.env.QUOTE_REEL_CAPTION_OFFSET_SEC ?? 0),
        premiumKeywords: (process.env.QUOTE_REEL_HIGHLIGHT_WORDS ?? "")
          .split(",")
          .map((word) => word.trim())
          .filter(Boolean),
      });

      const subtitlePaths = subtitleFiles.map(subtitleToPath).filter(Boolean);
      cleanupSubtitlePaths.push(...subtitlePaths);

      await dbUpdateJobStage(jobId, "rendering", 86);

      const rendered = await renderShortsWithSubtitles([baseVideoPath], subtitleFiles, {
        aspect: "vertical",
        style: captionStyle,
        captionsEnabled: true,
        fadeOutSec: 1.5,
        normalizeAudio: true,
        qualityPreset: "premium",
      });

      finalVideoPath = toLocalAssetPath(rendered.videos[0]);
      finalThumbPath = toLocalAssetPath(rendered.thumbs[0]);

      cleanupExtraPaths.push(
        ...rendered.videos.filter(Boolean),
        ...rendered.thumbs.filter(Boolean),
      );
    } else {
      await dbSetJobCaptionDrafts(jobId, []);
      await dbUpdateJobStage(jobId, "rendering", 86);
    }

    await dbUpdateJobStage(jobId, "uploading", 94);

    const uploadedVideo = await uploadLocalFileToStorage(
      finalVideoPath,
      `jobs/${jobId}/quote-reel.mp4`,
    );

    const thumbExt = path.extname(finalThumbPath) || ".jpg";
    const uploadedThumb = await uploadLocalFileToStorage(
      finalThumbPath,
      `jobs/${jobId}/quote-reel-thumb${thumbExt}`,
    );

    await dbSetJobCaptionedResults(jobId, [uploadedVideo.publicUrl], [uploadedThumb.publicUrl]);

    await dbUpdateJobQuoteMeta(jobId, {
      ...existingMeta,
      mode,
      tone,
      sourceText: scriptPlan.sourceText,
      generatedText: scriptPlan.generatedText,
      finalScript: scriptPlan.finalScript,
      targetDurationSec,
      minDurationSec,
      maxDurationSec,
      actualDurationSec: assembly.actualDurationSec,
      captionsEnabled,
      captionStyle,
      captionPreset,
      voiceEnabled,
      voicePreset,
      segments: scriptPlan.segments,
      selectedAssets: assetPicks,
      instagramCaption: scriptPlan.instagramCaption,
      hashtags: scriptPlan.hashtags,
      musicSuggestions: scriptPlan.musicSuggestions,
      voiceover: voiceoverMetaPatch,
    });

    await dbUpdateJobStage(jobId, "finished", 100);
    await dbUpdateJobStatus(jobId, "done");

    await cleanupLocalJobArtifacts({
      clipPaths: cleanupClipPaths,
      audioPaths: cleanupAudioPaths,
      subtitlePaths: cleanupSubtitlePaths,
      extraPaths: cleanupExtraPaths,
    });
  } catch (err) {
    console.error("[processQuoteReelJob] Error:", err);

    await dbUpdateJobStatus(jobId, "failed");
    await dbUpdateJobStage(jobId, "finished", 100);

    await cleanupLocalJobArtifacts({
      clipPaths: cleanupClipPaths,
      audioPaths: cleanupAudioPaths,
      subtitlePaths: cleanupSubtitlePaths,
      extraPaths: cleanupExtraPaths,
    });

    throw err;
  }
}
