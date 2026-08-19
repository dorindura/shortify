// src/server/video/faceCrop.ts
import { spawn } from "child_process";
import path from "path";

export type SmartCropSegment = {
    tStart: number;
    tEnd: number;
    centerXNorm: number;
    hasFace: boolean;
    // True when this segment begins on a hard camera cut. The renderer must
    // step to it instantly: easing across a cut pans over a picture that is no
    // longer on screen, which reads as the crop "arriving late".
    hardCut?: boolean;
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
    cuts?: number[];
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

type ShotWindow = { start: number; end: number };

// The shot containing t, bounded by the surrounding camera cuts. Every face
// statistic is confined to this window: an observation from before the cut
// describes a different picture entirely, so letting it vote is what kept the
// crop briefly holding the previous shot's subject after a cut.
function shotBoundsAt(cuts: number[], t: number, duration: number): ShotWindow {
    let start = 0;
    let end = duration;

    for (const c of cuts) {
        if (c <= t + 1e-9 && c > start) start = c;
        if (c > t + 1e-9 && c < end) end = c;
    }

    return { start, end };
}

function inShot(p: FaceTimelinePoint, shot?: ShotWindow): boolean {
    if (!shot) return true;
    return p.t >= shot.start - 1e-9 && p.t < shot.end + 1e-9;
}

function getPointNearTime(
    track: FaceTrack,
    t: number,
    maxGap: number,
    shot?: ShotWindow
): FaceTimelinePoint | null {
    if (!track.timeline.length) return null;

    let best: FaceTimelinePoint | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const p of track.timeline) {
        if (!inShot(p, shot)) continue;

        const d = Math.abs(p.t - t);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    }
    return best && bestDist <= maxGap ? best : null;
}

type TimeSample = { t: number; trackIndex: number | null; x: number; hardCut: boolean };

function pointsInWindow(
    track: FaceTrack,
    t: number,
    win: number,
    shot?: ShotWindow
): FaceTimelinePoint[] {
    return track.timeline.filter((p) => Math.abs(p.t - t) <= win && inShot(p, shot));
}

// The analyzer's own sampling rate, recovered from the timelines so the
// presence maths below does not depend on a constant shared across languages.
function estimateSampleRate(faces: FaceTrack[]): number {
    const gaps: number[] = [];

    for (const f of faces) {
        for (let i = 1; i < f.timeline.length; i++) {
            const d = f.timeline[i].t - f.timeline[i - 1].t;
            if (d > 1e-6 && d < 1) gaps.push(d);
        }
    }

    if (!gaps.length) return 10;

    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    return median > 1e-6 ? 1 / median : 10;
}

// How reliably the detector actually sees this face around t, 0..1. A face
// present on nearly every sample is a far safer subject than one flickering in
// and out, and in a wide two-shot presence separates the two people much more
// cleanly than face size does - size just picks whoever sits closest to the
// camera, speaking or not.
function presenceScore(
    track: FaceTrack,
    t: number,
    win: number,
    sampleRate: number,
    shot?: ShotWindow
): number {
    // Expected count is measured over the part of the window that actually lies
    // inside the shot, so a face is not punished for the shot being young.
    const from = Math.max(t - win, shot?.start ?? t - win);
    const to = Math.min(t + win, shot?.end ?? t + win);
    const expected = Math.max(1, Math.round(Math.max(0, to - from) * sampleRate));

    return clamp01(pointsInWindow(track, t, win, shot).length / expected);
}

// Speaking shows up as the mouth repeatedly opening and closing, so the spread
// of openness across a short window carries the signal. The instantaneous value
// does not: a resting mouth and a mid-syllable mouth can read the same.
function mouthActivity(track: FaceTrack, t: number, win: number, shot?: ShotWindow): number {
    const vals = pointsInWindow(track, t, win, shot).map((p) => p.mouth ?? 0);
    if (vals.length < 3) return 0;

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
    return Math.sqrt(variance);
}

function buildTimeSamples(
    faces: FaceTrack[],
    duration: number,
    energyFrames: EnergyFrame[] = [],
    cuts: number[] = []
): TimeSample[] {
    const samples: TimeSample[] = [];
    if (!faces.length || duration <= 0) return samples;

    const dt = 0.25;
    const maxGap = 0.6;

    const ENERGY_SPEECH_THRESHOLD = 0.18;

    // Window used for the presence and mouth statistics.
    const STAT_WIN = 0.75;
    // Mouth stdev that counts as "clearly talking"; measured off real podcast
    // footage, where an active speaker sits around 0.02-0.03.
    const MOUTH_ACTIVITY_FULL = 0.03;

    // Scoring weights. Presence leads because it is the most trustworthy signal
    // at wide-shot face sizes; mouth activity breaks ties between two equally
    // present faces; area only nudges, since it otherwise always elects
    // whoever is nearest the lens.
    const W_PRESENCE = 0.40;
    const W_MOUTH = 0.40;
    const W_AREA = 0.20;

    // stability knobs (these are the important ones)
    const MIN_HOLD_SEC = 1.0;         // never switch more often than this
    const REQUIRED_WINS = 3;          // best must win this many consecutive samples
    const SWITCH_BOOST = 1.25;        // best must be 25% better than current
    const STICKY_BONUS = 0.10;        // keep current track stable

    const sampleRate = estimateSampleRate(faces);

    let currentTrackIndex: number | null = null;
    let currentX = 0.5;

    let lastSwitchT = -1e9;
    let candidateIdx: number | null = null;
    let candidateWins = 0;

    let lastSeenFaceT = -1;

    for (let t = 0; t <= duration + 1e-3; t += dt) {
        // A hard cut ends all continuity: the subject we were holding may not
        // even be on screen any more. Drop the lock and the hysteresis so the
        // next sample re-elects a subject immediately instead of spending up to
        // MIN_HOLD_SEC + REQUIRED_WINS framing the previous shot.
        const isCut = cuts.some((c) => c > t - dt && c <= t + 1e-9);

        if (isCut) {
            currentTrackIndex = null;
            candidateIdx = null;
            candidateWins = 0;
            lastSwitchT = -1e9;
        }

        const e = energyAt(energyFrames ?? [], t);
        const speechHint = e >= ENERGY_SPEECH_THRESHOLD;

        const shot = shotBoundsAt(cuts, t, duration);

        const raw: { idx: number; area: number; presence: number; mouth: number; x: number }[] = [];

        faces.forEach((track, idx) => {
            const pt = getPointNearTime(track, t, maxGap, shot);
            if (!pt) return;

            raw.push({
                idx,
                area: (pt.w ?? 0) * (pt.h ?? 0),
                presence: presenceScore(track, t, STAT_WIN, sampleRate, shot),
                mouth: mouthActivity(track, t, STAT_WIN, shot),
                x: clamp01(pt.x),
            });
        });

        const maxArea = Math.max(1e-9, ...raw.map((r) => r.area));

        const candidates = raw.map((r) => {
            // Everything is normalised into 0..1 before weighting. The previous
            // scoring summed a raw area (~0.03) against a sticky bonus (0.15),
            // so the bonus silently outweighed every real signal.
            const areaNorm = clamp01(r.area / maxArea);
            const mouthNorm = clamp01(r.mouth / MOUTH_ACTIVITY_FULL);

            let score =
                W_PRESENCE * r.presence +
                W_MOUTH * (speechHint ? mouthNorm : mouthNorm * 0.5) +
                W_AREA * areaNorm;

            if (currentTrackIndex !== null && r.idx === currentTrackIndex) {
                score += STICKY_BONUS;
            }

            return { idx: r.idx, score, x: r.x };
        });

        candidates.sort((a, b) => b.score - a.score);

        if (!candidates.length) {
            if (currentTrackIndex !== null && t - lastSeenFaceT <= 1.2) {
                samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
            } else {
                samples.push({ t, trackIndex: null, x: currentX, hardCut: isCut }); // hold lastX
            }
            continue;
        }

        const best = candidates[0];

        // first lock
        if (currentTrackIndex === null) {
            currentTrackIndex = best.idx;
            currentX = best.x;
            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
            continue;
        }

        const curr = candidates.find(c => c.idx === currentTrackIndex);

        if (!curr) {
            currentTrackIndex = best.idx;
            currentX = best.x;
            lastSeenFaceT = t;
            candidateIdx = null;
            candidateWins = 0;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
            continue;
        }

        // HOLD if we switched too recently
        if (t - lastSwitchT < MIN_HOLD_SEC) {
            currentX = curr.x;
            lastSeenFaceT = t;
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
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
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
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
            samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
            continue;
        }

        // not enough wins yet -> hold current
        currentX = curr.x;
        lastSeenFaceT = t;
        samples.push({ t, trackIndex: currentTrackIndex, x: currentX, hardCut: isCut });
    }

    return samples;
}


// Compress samples into segments
function samplesToSegments(samples: TimeSample[], duration: number): SmartCropSegment[] {
    if (!samples.length || duration <= 0) return [];

    // DO NOT delete short segments. Beta needs "something" rather than center fallback.
    const maxXShiftPerSegment = 0.12;

    const segs: {
        tStart: number;
        tEnd: number;
        trackIndex: number | null;
        sumX: number;
        count: number;
        lastX: number;
        hardCut: boolean;
    }[] = [];

    let cur: (typeof segs)[number] | null = null;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const nextT = i < samples.length - 1 ? samples[i + 1].t : duration;

        if (!cur) {
            cur = { tStart: s.t, tEnd: nextT, trackIndex: s.trackIndex, sumX: s.x, count: 1, lastX: s.x, hardCut: s.hardCut };
            continue;
        }

        const sameTrack = cur.trackIndex === s.trackIndex;
        const xShift = Math.abs(s.x - cur.lastX);

        // A cut always breaks the segment, even when the subject barely moved,
        // so the renderer can step rather than glide across it.
        if (!s.hardCut && sameTrack && xShift <= maxXShiftPerSegment) {
            cur.tEnd = nextT;
            cur.sumX += s.x;
            cur.count += 1;
            cur.lastX = s.x;
        } else {
            segs.push(cur);
            cur = { tStart: s.t, tEnd: nextT, trackIndex: s.trackIndex, sumX: s.x, count: 1, lastX: s.x, hardCut: s.hardCut };
        }
    }
    if (cur) segs.push(cur);

    return segs.map((s) => ({
        tStart: s.tStart,
        tEnd: s.tEnd,
        centerXNorm: clamp01(s.sumX / Math.max(1, s.count)),
        hasFace: s.trackIndex !== null,
        hardCut: s.hardCut,
    }));
}

// Fill gaps by HOLDING lastX (never force 0.5)
function fillGapsWithNeutral(
    faceSegments: SmartCropSegment[],
    duration: number,
    cuts: number[] = []
): SmartCropSegment[] {
    const result: SmartCropSegment[] = [];
    const sorted = [...faceSegments].sort((a, b) => a.tStart - b.tStart);

    let cursor = 0;
    let lastX = sorted.length ? sorted[0].centerXNorm : 0.5;

    for (const seg of sorted) {
        if (seg.tStart > cursor + 0.03) {
            // A gap means the detector saw nobody. Holding the previous framing
            // is only defensible while we are still inside the same shot; once
            // the camera has cut, that framing describes a picture that is gone,
            // which is how a clip ends up locked on empty furniture. From the
            // cut onward, adopt the next known face position instead.
            const cutInGap = cuts.find((c) => c > cursor + 1e-6 && c < seg.tStart - 1e-6);

            if (cutInGap != null) {
                result.push({ tStart: cursor, tEnd: cutInGap, centerXNorm: lastX, hasFace: false });
                result.push({
                    tStart: cutInGap,
                    tEnd: seg.tStart,
                    centerXNorm: seg.centerXNorm,
                    hasFace: false,
                    hardCut: true,
                });
            } else {
                result.push({ tStart: cursor, tEnd: seg.tStart, centerXNorm: lastX, hasFace: false });
            }
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
    maxDeltaPerSec = 0.22 // 0.18-0.28 feels good; smaller = smoother
): SmartCropSegment[] {
    if (!segments.length) return segments;

    const out: SmartCropSegment[] = [];
    let prevX = segments[0].centerXNorm;

    for (const s of segments) {
        const dt = Math.max(1e-6, s.tEnd - s.tStart);
        const maxDelta = maxDeltaPerSec * dt;

        let x = s.centerXNorm;

        // Never rate-limit across a cut. The speed limit exists to keep pans
        // watchable within a shot; applied to a cut it just makes the crop crawl
        // toward the new subject over a second or more.
        if (!s.hardCut) {
            const delta = x - prevX;

            if (Math.abs(delta) > maxDelta) {
                x = prevX + Math.sign(delta) * maxDelta;
            }
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
            const cuts = analysis.cuts ?? [];
            const samples = buildTimeSamples(faces, duration, energyFrames ?? [], cuts);
            const segments = samplesToSegments(samples, duration);
            const fullSegmentsRaw = fillGapsWithNeutral(segments, duration, cuts);
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
                    cut: !!s.hardCut,
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
