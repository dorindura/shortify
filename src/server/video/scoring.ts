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
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
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
    videoPath: string
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

        const segments =
            (resp.segments ?? []).map((seg, idx) => ({
                id: seg.id ?? idx,
                start: seg.start,
                end: seg.end,
                text: (seg.text ?? "").trim(),
            })) ?? [];

        const duration: number =
            typeof resp.duration === "number"
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
    targetDurationSec: number
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
    b: { start: number; end: number }
): number {
    const interStart = Math.max(a.start, b.start);
    const interEnd = Math.min(a.end, b.end);
    const intersection = Math.max(0, interEnd - interStart);
    const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
    if (union <= 0) return 0;
    return intersection / union;
}

/**
 * Main entry: Analyze transcript and produce high-quality clip candidates
 * around ~25s (target), respecting min/max and avoiding overlaps.
 */
export async function analyzeTranscriptForClips(
    videoPath: string,
    opts: AnalyzeOptions = {}
): Promise<ClipCandidate[]> {
    const maxClips = opts.maxClips ?? 5;
    const minDurationSec = opts.minDurationSec ?? 20;
    const maxDurationSec = opts.maxDurationSec ?? 30;
    const targetDurationSec = opts.targetDurationSec ?? 25; // 👈 B: your choice

    const { segments, duration } = await transcribeVideoWithSegments(videoPath);

    if (!segments.length || duration <= 0) {
        console.warn("[analyzeTranscriptForClips] No segments or invalid duration.");
        return [];
    }

    // Score each segment
    const scored = segments.map((seg, idx) => ({
        seg,
        score: scoreSegment(seg, idx),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const candidates: ClipCandidate[] = [];

    for (const { seg, score } of scored) {
        if (candidates.length >= maxClips) break;

        const window = buildWindowAroundSegment(
            seg,
            segments,
            duration,
            minDurationSec,
            maxDurationSec,
            targetDurationSec
        );

        // De-duplicate: skip if overlaps too much with an existing candidate
        const overlaps = candidates.some(
            (c) => intersectionOverUnion(c, window) > 0.4
        );
        if (overlaps) continue;

        candidates.push({
            start: window.start,
            end: window.end,
            score,
            reason: `Center segment: "${seg.text.slice(0, 80)}..."`,
        });
    }

    // console.log("[analyzeTranscriptForClips] candidates:", candidates);
    return candidates;
}
