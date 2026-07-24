// src/server/video/scoring.ts
import fs from "fs";
import OpenAI from "openai";
import { spawn } from "child_process";
import fsPromises from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type WhisperSegment = {
  id?: number;
  start: number;
  end: number;
  text: string;
};

export type WhisperVerboseResponse = {
  text: string;
  duration?: number;
  segments?: WhisperSegment[];
};

export type ClipCandidate = {
  start: number;
  end: number;
  score: number;
  reason: string;
  title?: string;
};

type AnalyzeOptions = {
  maxClips?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  targetDurationSec?: number;
};

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args);

    proc.stderr.on("data", (data) => {
      // console.log(`[${logPrefix}] ${data}`);
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function extractCompressedAudio(videoPath: string): Promise<string> {
  const AUDIO_DIR = path.join(process.cwd(), "tmp", "audio");
  await fsPromises.mkdir(AUDIO_DIR, { recursive: true });

  const outPath = path.join(AUDIO_DIR, `${randomUUID()}.mp3`);

  const args = [
    "-y",
    "-i",
    videoPath,
    "-map",
    "0:a:0?",
    "-vn",
    "-acodec",
    "libmp3lame",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "24k",
    outPath,
  ];

  await runCmd("ffmpeg", args, "extractAudioForWhisper");
  // console.log("[extractCompressedAudio] Created:", outPath);
  return outPath;
}

/**
 * Transcribe the full video and return per-segment timestamps.
 * Uses Whisper "verbose_json" so we get segments with start/end/time.
 */

async function transcribeVideoWithSegments(
  videoPath: string,
): Promise<{ segments: WhisperSegment[]; duration: number }> {
  let audioPath = "";
  let shouldDelete = false;

  try {
    // Always extract a small audio file for Whisper
    audioPath = await extractCompressedAudio(videoPath);
    shouldDelete = true;

    const resp = (await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioPath),
      response_format: "verbose_json",
      // we only need segment-level timestamps for scoring
      timestamp_granularities: ["segment"],
    })) as unknown as WhisperVerboseResponse;

    const segments = (resp.segments ?? []).map((seg, idx) => ({
      id: seg.id ?? idx,
      start: seg.start,
      end: seg.end,
      text: (seg.text ?? "").trim(),
    })) ?? [];

    const duration: number = typeof resp.duration === "number"
      ? resp.duration
      : segments.length > 0
      ? segments[segments.length - 1].end
      : 0;

    return { segments, duration };
  } finally {
    if (shouldDelete && audioPath) {
      fsPromises.unlink(audioPath).catch(() => {});
    }
  }
}

/**
 * A simple heuristic scoring for how "interesting" a segment is.
 * We can improve this later with GPT semantic scoring, but this
 * already gives a decent ranking.
 */
function scoreSegment(seg: WhisperSegment, index: number): number {
  const text = seg.text.toLowerCase();
  let score = 0;

  // length: more content usually more valuable up to a point
  const len = text.length;
  score += Math.min(len / 50, 3); // cap length influence

  // hooks / value words
  const hookKeywords = [
    "secret",
    "truth",
    "the reason",
    "the real reason",
    "here's why",
    "let me explain",
    "watch this",
    "you need to",
    "you have to",
    "this is how",
    "this is why",
    "here's how",
  ];
  if (hookKeywords.some((k) => text.includes(k))) {
    score += 4;
  }

  // questions often signal engagement
  if (text.includes("?")) score += 2;

  // emotional words
  const emotionKeywords = [
    "crazy",
    "insane",
    "unbelievable",
    "amazing",
    "huge",
    "massive",
    "love",
    "hate",
    "worried",
    "afraid",
  ];
  if (emotionKeywords.some((k) => text.includes(k))) {
    score += 2;
  }

  // slight boost if it's not extremely early/late in the video
  // (middle parts are often more interesting)
  score += 0.5;

  // small decay based on index so we don't always pick only early segments
  score -= index * 0.01;

  return score;
}

/**
 * Expand a "center" around one segment into a full clip window
 * of ~targetDurationSec, respecting min/max duration.
 */
function buildWindowAroundSegment(
  centerSeg: WhisperSegment,
  allSegments: WhisperSegment[],
  duration: number,
  minDurationSec: number,
  maxDurationSec: number,
  targetDurationSec: number,
): { start: number; end: number } {
  const centerTime = (centerSeg.start + centerSeg.end) / 2;
  let desiredStart = centerTime - targetDurationSec / 2;
  let desiredEnd = centerTime + targetDurationSec / 2;

  // Clamp to video bounds
  if (desiredStart < 0) {
    desiredEnd -= desiredStart; // shift window forward
    desiredStart = 0;
  }
  if (desiredEnd > duration) {
    const overflow = desiredEnd - duration;
    desiredStart = Math.max(0, desiredStart - overflow);
    desiredEnd = duration;
  }

  // Snap to nearest segment boundaries to avoid mid-sentence cuts
  let snappedStart = desiredStart;
  let snappedEnd = desiredEnd;

  // find segment that starts just before or at desiredStart
  const before = [...allSegments].filter((s) => s.start <= desiredStart);
  if (before.length > 0) {
    snappedStart = before[before.length - 1].start;
  } else if (allSegments.length > 0) {
    snappedStart = allSegments[0].start;
  }

  // find segment that ends just after or at desiredEnd
  const after = [...allSegments].filter((s) => s.end >= desiredEnd);
  if (after.length > 0) {
    snappedEnd = after[0].end;
  } else if (allSegments.length > 0) {
    snappedEnd = allSegments[allSegments.length - 1].end;
  }

  // Ensure we respect min/max by expanding if needed
  let finalStart = snappedStart;
  let finalEnd = snappedEnd;

  let currentDuration = finalEnd - finalStart;
  if (currentDuration < minDurationSec) {
    const missing = minDurationSec - currentDuration;

    // Try to expand equally on both sides
    const half = missing / 2;
    finalStart = Math.max(0, finalStart - half);
    finalEnd = Math.min(duration, finalEnd + half);
    currentDuration = finalEnd - finalStart;

    // If still too short (near boundaries), just extend forward/backward
    if (currentDuration < minDurationSec) {
      const extra = minDurationSec - currentDuration;
      if (finalStart === 0) {
        finalEnd = Math.min(duration, finalEnd + extra);
      } else if (finalEnd === duration) {
        finalStart = Math.max(0, finalStart - extra);
      }
    }
  }

  // Hard cap to maxDurationSec
  if (finalEnd - finalStart > maxDurationSec) {
    const mid = (finalStart + finalEnd) / 2;
    finalStart = Math.max(0, mid - maxDurationSec / 2);
    finalEnd = Math.min(duration, mid + maxDurationSec / 2);
  }

  return {
    start: Math.max(0, finalStart),
    end: Math.min(duration, finalEnd),
  };
}

/**
 * Utility: IoU of two time ranges, for de-duplication.
 */
function intersectionOverUnion(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  const interStart = Math.max(a.start, b.start);
  const interEnd = Math.min(a.end, b.end);
  const intersection = Math.max(0, interEnd - interStart);
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  if (union <= 0) return 0;
  return intersection / union;
}

type LlmMoment = { start: number; end: number; title?: string; reason?: string };

/**
 * Ask an LLM to read the timestamped transcript and choose the best
 * self-contained moments (hook -> payoff), ordered best first.
 */
async function selectMomentsWithLLM(
  segments: WhisperSegment[],
  duration: number,
  opts: {
    maxClips: number;
    minDurationSec: number;
    maxDurationSec: number;
    targetDurationSec: number;
  },
): Promise<LlmMoment[]> {
  const transcript = segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert short-form video editor who finds the most engaging, self-contained moments in a long video for standalone vertical shorts (TikTok / Reels / YouTube Shorts).

Each selected moment MUST:
- be a complete, self-contained thought with a clear hook and payoff (never start or end mid-idea),
- make sense on its own, without the rest of the video for context,
- be genuinely compelling: a strong opinion, insight, story, surprising fact, emotional beat, or punchy exchange,
- NOT overlap in time with any other selected moment.

CRITICAL about boundaries and length:
- The idea's completeness ALWAYS wins over hitting a target length.
- "start" MUST equal the start timestamp of the FIRST transcript line of the idea. "end" MUST equal the end timestamp of the LAST transcript line of the idea. Copy those exact timestamps from the transcript — do not invent values and do not cut inside a line.
- End the clip the moment the thought resolves. Do NOT run into the next, unrelated idea just to make the clip longer, and do NOT stop early and leave the thought unfinished just to be closer to the target.
- The target length is only a rough hint; the real length is whatever the complete idea takes.

Order the moments best-first.`,
      },
      {
        role: "user",
        content: `Video length: ${Math.round(duration)} seconds.
Pick exactly ${opts.maxClips} non-overlapping moments.
Rough length hint: ~${opts.targetDurationSec}s each (anywhere from ~${opts.minDurationSec}s to ~${opts.maxDurationSec}s is fine) — but a complete idea always wins over the hint.
Set "start" and "end" to timestamps that appear verbatim in the transcript lines (first line's start, last line's end), so the cut lands exactly on the idea's edges.

Transcript:
${transcript}

Return strict JSON: {"moments":[{"start":number,"end":number,"title":string,"reason":string}]}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) return [];

  let parsed: { moments?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.moments)) return [];

  const moments: LlmMoment[] = [];
  for (const item of parsed.moments) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const start = Number(m.start);
    const end = Number(m.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end - start < 3 || start < 0 || end > duration + 1) continue;

    moments.push({
      start: Math.max(0, start),
      end: Math.min(duration, end),
      title: typeof m.title === "string" ? m.title : undefined,
      reason: typeof m.reason === "string" ? m.reason : undefined,
    });
  }

  return moments;
}

/**
 * Snap a desired [start,end] to transcript sentence boundaries so the clip ends
 * exactly where the idea ends. The clip is NEVER extended (that would pull in the
 * next, unrelated idea) — a short complete idea stays short. Only a hard ceiling
 * pulls an over-long pick back, always landing on a sentence boundary.
 */
function normalizeWindow(
  desiredStart: number,
  desiredEnd: number,
  segments: WhisperSegment[],
  duration: number,
  hardCeilingSec: number,
): { start: number; end: number } {
  let start = clamp(desiredStart, 0, duration);
  let end = clamp(desiredEnd, 0, duration);

  // Snap to the nearest transcript boundaries so clips don't cut mid-sentence.
  const before = segments.filter((s) => s.start <= start + 0.25);
  if (before.length) start = before[before.length - 1].start;

  const after = segments.filter((s) => s.end >= end - 0.25);
  if (after.length) end = after[0].end;

  // Degenerate pick: fall back to the single sentence at the start.
  if (end <= start) {
    const seg = segments.find((s) => s.end > start);
    end = seg ? seg.end : Math.min(duration, start + 8);
  }

  // Above the hard ceiling: pull back to the last full sentence within the cap.
  if (end - start > hardCeilingSec) {
    const limit = start + hardCeilingSec;
    const within = segments.filter((s) => s.end <= limit && s.end > start);
    end = within.length ? within[within.length - 1].end : Math.min(duration, limit);
  }

  return { start: Math.max(0, start), end: Math.min(duration, end) };
}

/** True if two windows overlap within a minimum gap (guarantees distinct clips). */
function windowsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
  gap: number,
): boolean {
  return !(b.start >= a.end + gap || a.start >= b.end + gap);
}

/**
 * Main entry: pick the best clip moments using an LLM over the transcript,
 * guaranteeing the returned clips never share footage (strict non-overlap).
 * Fills up to maxClips with the next-best non-overlapping segments so the user
 * always gets the number of shorts they asked for. Falls back to the keyword
 * heuristic if the LLM call fails.
 */
export async function analyzeTranscriptForClips(
  videoPath: string,
  opts: AnalyzeOptions = {},
): Promise<ClipCandidate[]> {
  const maxClips = opts.maxClips ?? 5;
  const minDurationSec = opts.minDurationSec ?? 20;
  const maxDurationSec = opts.maxDurationSec ?? 30;
  const targetDurationSec = opts.targetDurationSec ?? 25;

  const { segments, duration } = await transcribeVideoWithSegments(videoPath);

  if (!segments.length || duration <= 0) {
    console.warn("[analyzeTranscriptForClips] No segments or invalid duration.");
    return [];
  }

  const MIN_GAP = 1.0;
  // Length is idea-driven: the clip ends where the thought ends. A hard ceiling
  // (3 min) protects platform limits; anything below MIN_CLIP_SEC is dropped
  // rather than padded (never extend into unrelated footage). The chosen target
  // is only a hint to the LLM, never a forced cut.
  const HARD_CEILING_SEC = 180;
  const MIN_CLIP_SEC = 7;
  const accepted: ClipCandidate[] = [];

  const tryAccept = (
    desiredStart: number,
    desiredEnd: number,
    score: number,
    reason: string,
    title?: string,
  ): boolean => {
    if (accepted.length >= maxClips) return false;

    const w = normalizeWindow(desiredStart, desiredEnd, segments, duration, HARD_CEILING_SEC);

    if (w.end - w.start < MIN_CLIP_SEC) return false;
    if (accepted.some((c) => windowsOverlap(c, w, MIN_GAP))) return false;

    accepted.push({ start: w.start, end: w.end, score, reason, title });
    return true;
  };

  // 1) LLM-selected moments (best first).
  let llmMoments: LlmMoment[] = [];
  try {
    llmMoments = await selectMomentsWithLLM(segments, duration, {
      maxClips,
      minDurationSec,
      maxDurationSec,
      targetDurationSec,
    });
  } catch (err) {
    console.error("[analyzeTranscriptForClips] LLM selection failed, using heuristic:", err);
  }

  for (let i = 0; i < llmMoments.length; i += 1) {
    if (accepted.length >= maxClips) break;
    const m = llmMoments[i];
    tryAccept(m.start, m.end, 1000 - i, m.reason ?? "LLM moment", m.title);
  }

  // 2) Fill remaining slots with the best non-overlapping heuristic segments,
  //    so the user always gets exactly maxClips when the video is long enough.
  if (accepted.length < maxClips) {
    const scored = segments
      .map((seg, idx) => ({ seg, score: scoreSegment(seg, idx) }))
      .sort((a, b) => b.score - a.score);

    for (const { seg, score } of scored) {
      if (accepted.length >= maxClips) break;
      const center = (seg.start + seg.end) / 2;
      tryAccept(
        center - targetDurationSec / 2,
        center + targetDurationSec / 2,
        score,
        `Fallback: "${seg.text.slice(0, 60)}..."`,
      );
    }
  }

  // Chronological order = a natural sequence of shorts.
  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

export type SummaryOptions = {
  targetSec?: number; // total duration of summary
  segmentLenSec?: number; // each “highlight” length
  maxHighlights?: number; // cap highlights
};

export type SummaryRange = {
  start: number;
  end: number;
  score: number;
  reason: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function analyzeTranscriptForSummary(
  videoPath: string,
  opts: SummaryOptions = {},
): Promise<SummaryRange[]> {
  const targetSec = clamp(opts.targetSec ?? 90, 30, 300);
  const segmentLenSec = clamp(opts.segmentLenSec ?? 8, 5, 20);

  // how many highlights we need to roughly hit target
  const needed = Math.ceil(targetSec / segmentLenSec);
  const maxHighlights = clamp(opts.maxHighlights ?? needed + 2, 3, 30);

  const { segments, duration } = await transcribeVideoWithSegments(videoPath);

  if (!segments.length || duration <= 0) {
    console.warn(
      "[analyzeTranscriptForSummary] No segments or invalid duration.",
    );
    return [];
  }

  // score segments (reuse your heuristic)
  const scored = segments.map((seg, idx) => ({
    seg,
    score: scoreSegment(seg, idx),
  }));

  scored.sort((a, b) => b.score - a.score);

  const picked: SummaryRange[] = [];

  for (const { seg, score } of scored) {
    if (picked.length >= maxHighlights) break;

    const w = buildWindowAroundSegment(
      seg,
      segments,
      duration,
      Math.max(5, segmentLenSec - 2),
      segmentLenSec + 2,
      segmentLenSec,
    );

    const MIN_GAP = Math.max(1.0, Math.min(2.0, segmentLenSec * 0.12));

    const tooClose = picked.some((p) => {
      const distance = w.end < p.start
        ? p.start - w.end
        : p.end < w.start
        ? w.start - p.end
        : 0;

      const overlaps = intersectionOverUnion(p, w) > 0.3;
      return overlaps || distance < MIN_GAP;
    });

    if (tooClose) continue;

    picked.push({
      start: w.start,
      end: w.end,
      score,
      reason: `Highlight: "${(seg.text ?? "").slice(0, 80)}..."`,
    });

    // stop early if we already have enough time
    const total = picked.reduce((sum, r) => sum + (r.end - r.start), 0);
    if (picked.length >= needed && total >= targetSec * 0.92) break;
  }

  // IMPORTANT: keep story flow → sort by time
  picked.sort((a, b) => a.start - b.start);

  // trim if we overshoot too hard
  let total = 0;
  const final: SummaryRange[] = [];
  for (const r of picked) {
    const len = r.end - r.start;
    if (final.length >= 3 && total + len > targetSec * 1.08) break;
    final.push(r);
    total += len;
  }

  return final;
}
