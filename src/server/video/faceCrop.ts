// src/server/video/faceCrop.ts
import { spawn } from "child_process";
import path from "path";

export type SmartCropSegment = {
    tStart: number;
    tEnd: number;
    centerXNorm: number;
    hasFace: boolean;
};

export type SmartCropBox = {
    segments: SmartCropSegment[];
};

type FaceTimelinePoint = {
    t: number;
    x: number;
    y: number;
    w: number;
    h: number;
    mouth?: number;
};

type FaceTrack = {
    id: number;
    timeline: FaceTimelinePoint[];
};

type ClipAnalysis = {
    clipPath: string;
    fps?: number;
    duration?: number;
    faces?: FaceTrack[];
    error?: string;
};

export type EnergyFrame = { tStart: number; tEnd: number; energy: number };

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function energyAt(frames: EnergyFrame[], t: number): number {
    if (!frames.length) return 0;
    for (const f of frames) {
        if (t >= f.tStart && t < f.tEnd) return f.energy;
    }
    return frames[frames.length - 1]?.energy ?? 0;
}

function runFaceAnalyzer(clips: string[]): Promise<ClipAnalysis[]> {
    return new Promise((resolve, reject) => {
        if (!clips.length) return resolve([]);

        const scriptPath = path.join(process.cwd(), "src", "python", "face_crop_analyzer.py");
        const args = [scriptPath, "--clips", ...clips];

        console.log("[analyzeFaceCropsForClips] Running python3", args.join(" "));

        const proc = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => (stdout += data.toString()));
        proc.stderr.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            console.log("[face_crop_analyzer stderr]", text);
        });

        proc.on("error", (err) => reject(err));

        proc.on("close", (code) => {
            if (code !== 0) {
                console.error("[analyzeFaceCropsForClips] Python exited", code, "stderr:", stderr);
                return reject(new Error(`face_crop_analyzer exited with code ${code}`));
            }
            try {
                const parsed = JSON.parse(stdout.trim() || "[]") as ClipAnalysis[];
                resolve(parsed);
            } catch (err) {
                console.error("[analyzeFaceCropsForClips] JSON parse failed:", err, "stdout:", stdout);
                reject(err);
            }
        });
    });
}

function getPointNearTime(track: FaceTrack, t: number, maxGap: number): FaceTimelinePoint | null {
    if (!track.timeline.length) return null;

    let best: FaceTimelinePoint | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const p of track.timeline) {
        const d = Math.abs(p.t - t);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    }
    return best && bestDist <= maxGap ? best : null;
}

type TimeSample = { t: number; trackIndex: number | null; x: number };

function buildTimeSamples(
    faces: FaceTrack[],
    duration: number,
    energyFrames: EnergyFrame[] = []
): TimeSample[] {
    const samples: TimeSample[] = [];
    if (!faces.length || duration <= 0) return samples;

    const dt = 0.25;
    const maxGap = 0.6;

    const ENERGY_SPEECH_THRESHOLD = 0.18;

    // stability knobs (these are the important ones)
    const MIN_HOLD_SEC = 1.0;         // never switch more often than this
    const REQUIRED_WINS = 3;          // best must win this many consecutive samples
    const SWITCH_BOOST = 1.25;        // best must be 25% better than current
    const STICKY_BONUS = 0.15;        // keep current track stable

    let currentTrackIndex: number | null = null;
    let currentX = 0.5;

    let lastSwitchT = -1e9;
    let candidateIdx: number | null = null;
    let candidateWins = 0;

    let lastSeenFaceT = -1;

    for (let t = 0; t <= duration + 1e-3; t += dt) {
        const e = energyAt(energyFrames ?? [], t);
        const speechHint = e >= ENERGY_SPEECH_THRESHOLD;

        const candidates: { idx: number; score: number; x: number }[] = [];

        faces.forEach((track, idx) => {
            const pt = getPointNearTime(track, t, maxGap);
            if (!pt) return;

            const area = (pt.w ?? 0) * (pt.h ?? 0);
            const mouth = pt.mouth ?? 0;

            // IMPORTANT: mouth can be noisy. Only use it as a *small* boost.
            // And only when we have a speech hint.
            let score = area;
            if (speechHint) score += mouth * 1.5;

            // sticky bonus
            if (currentTrackIndex !== null && idx === currentTrackIndex) {
                score += STICKY_BONUS;
            }

            candidates.push({ idx, score, x: clamp01(pt.x) });
        });

        candidates.sort((a, b) => b.score - a.score);

        if (!candidates.length) {
            if (currentTrackIndex !== null && t - lastSeenFaceT <= 1.2) {
                samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            } else {
                samples.push({ t, trackIndex: null, x: currentX }); // hold lastX
            }
            continue;
        }

        const best = candidates[0];

        // first lock
        if (currentTrackIndex === null) {
            currentTrackIndex = best.idx;
            currentX = best.x;
            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            continue;
        }

        const curr = candidates.find(c => c.idx === currentTrackIndex);

        if (!curr) {
            currentTrackIndex = best.idx;
            currentX = best.x;
            lastSeenFaceT = t;
            candidateIdx = null;
            candidateWins = 0;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            continue;
        }

        // HOLD if we switched too recently
        if (t - lastSwitchT < MIN_HOLD_SEC) {
            currentX = curr.x;
            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            continue;
        }

        // Should we even consider switching?
        const bestClearlyBetter =
            best.idx !== currentTrackIndex &&
            best.score >= curr.score * SWITCH_BOOST;

        if (!bestClearlyBetter) {
            // reset candidate switch
            candidateIdx = null;
            candidateWins = 0;

            currentX = curr.x;
            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            continue;
        }

        // Candidate must win N consecutive samples
        if (candidateIdx !== best.idx) {
            candidateIdx = best.idx;
            candidateWins = 1;
        } else {
            candidateWins += 1;
        }

        if (candidateWins >= REQUIRED_WINS) {
            console.log(`[faceCrop] SWITCH @t=${t.toFixed(2)}s to track ${faces[best.idx]?.id}`);
            currentTrackIndex = best.idx;
            currentX = best.x;
            lastSwitchT = t;

            candidateIdx = null;
            candidateWins = 0;

            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
            continue;
        }

        // not enough wins yet → hold current
        currentX = curr.x;
        lastSeenFaceT = t;
        samples.push({ t, trackIndex: currentTrackIndex, x: currentX });
    }

    return samples;
}


// Compress samples into segments
function samplesToSegments(samples: TimeSample[], duration: number): SmartCropSegment[] {
    if (!samples.length || duration <= 0) return [];

    // DO NOT delete short segments. Beta needs “something” rather than center fallback.
    const maxXShiftPerSegment = 0.12;

    const segs: {
        tStart: number;
        tEnd: number;
        trackIndex: number | null;
        sumX: number;
        count: number;
        lastX: number;
    }[] = [];

    let cur: (typeof segs)[number] | null = null;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const nextT = i < samples.length - 1 ? samples[i + 1].t : duration;

        if (!cur) {
            cur = { tStart: s.t, tEnd: nextT, trackIndex: s.trackIndex, sumX: s.x, count: 1, lastX: s.x };
            continue;
        }

        const sameTrack = cur.trackIndex === s.trackIndex;
        const xShift = Math.abs(s.x - cur.lastX);

        if (sameTrack && xShift <= maxXShiftPerSegment) {
            cur.tEnd = nextT;
            cur.sumX += s.x;
            cur.count += 1;
            cur.lastX = s.x;
        } else {
            segs.push(cur);
            cur = { tStart: s.t, tEnd: nextT, trackIndex: s.trackIndex, sumX: s.x, count: 1, lastX: s.x };
        }
    }
    if (cur) segs.push(cur);

    return segs.map((s) => ({
        tStart: s.tStart,
        tEnd: s.tEnd,
        centerXNorm: clamp01(s.sumX / Math.max(1, s.count)),
        hasFace: s.trackIndex !== null,
    }));
}

// Fill gaps by HOLDING lastX (never force 0.5)
function fillGapsWithNeutral(faceSegments: SmartCropSegment[], duration: number): SmartCropSegment[] {
    const result: SmartCropSegment[] = [];
    const sorted = [...faceSegments].sort((a, b) => a.tStart - b.tStart);

    let cursor = 0;
    let lastX = sorted.length ? sorted[0].centerXNorm : 0.5;

    for (const seg of sorted) {
        if (seg.tStart > cursor + 0.03) {
            result.push({ tStart: cursor, tEnd: seg.tStart, centerXNorm: lastX, hasFace: false });
        }
        result.push(seg);
        cursor = seg.tEnd;
        lastX = seg.centerXNorm;
    }

    if (cursor < duration - 0.03) {
        result.push({ tStart: cursor, tEnd: duration, centerXNorm: lastX, hasFace: false });
    }

    return result;
}

function smoothSegmentsBySpeed(
    segments: SmartCropSegment[],
    duration: number,
    maxDeltaPerSec = 0.22 // 0.18–0.28 feels good; smaller = smoother
): SmartCropSegment[] {
    if (!segments.length) return segments;

    const out: SmartCropSegment[] = [];
    let prevX = segments[0].centerXNorm;

    for (const s of segments) {
        const dt = Math.max(1e-6, s.tEnd - s.tStart);
        const maxDelta = maxDeltaPerSec * dt;

        let x = s.centerXNorm;
        const delta = x - prevX;

        if (Math.abs(delta) > maxDelta) {
            x = prevX + Math.sign(delta) * maxDelta;
        }

        out.push({ ...s, centerXNorm: clamp01(x) });
        prevX = x;
    }

    return out;
}

// ---- MAIN ----

export async function analyzeFaceCropsForClips(
    clips: string[],
    energyByClip?: (EnergyFrame[] | null)[]
): Promise<(SmartCropBox | null)[]> {
    if (!clips.length) return [];

    try {
        const analyses = await runFaceAnalyzer(clips);
        const boxes: (SmartCropBox | null)[] = [];

        for (let i = 0; i < clips.length; i++) {
            const clipPath = clips[i];

            const analysis =
                analyses.find((a) => a.clipPath && path.resolve(a.clipPath) === path.resolve(clipPath)) ??
                analyses[i];

            if (!analysis || analysis.error) {
                console.warn("[analyzeFaceCropsForClips] no analysis/error for", clipPath, analysis?.error);
                boxes.push(null);
                continue;
            }

            const faces = analysis.faces ?? [];
            const duration =
                typeof analysis.duration === "number" && analysis.duration > 0
                    ? analysis.duration
                    : Math.max(0, ...faces.flatMap((f) => f.timeline.map((p) => p.t)));

            if (!faces.length || duration <= 0) {
                boxes.push(null);
                continue;
            }

            const energyFrames = energyByClip?.[i] ?? [];
            const samples = buildTimeSamples(faces, duration, energyFrames ?? []);
            const segments = samplesToSegments(samples, duration);
            // const fullSegments = fillGapsWithNeutral(segments, duration);
            const fullSegmentsRaw = fillGapsWithNeutral(segments, duration);
            const fullSegments = smoothSegmentsBySpeed(fullSegmentsRaw, duration, 0.22);

            if (!fullSegments.length) {
                boxes.push(null);
                continue;
            }

            console.log(
                "[faceCrop] Clip:",
                clipPath,
                "segments:",
                fullSegments.slice(0, 12).map((s) => ({
                    tStart: s.tStart.toFixed(2),
                    tEnd: s.tEnd.toFixed(2),
                    x: s.centerXNorm.toFixed(3),
                    hasFace: s.hasFace,
                }))
            );

            boxes.push({ segments: fullSegments });
        }

        return boxes;
    } catch (err) {
        console.error("[analyzeFaceCropsForClips] Fatal error:", err);
        return clips.map(() => null);
    }
}
