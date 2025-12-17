// src/server/jobs/worker.ts
import {
    getJob,
    updateJobStatus,
    setJobClips,
    setJobCaptionedResults,
    updateJobStage,
} from "@lib/jobsStore";
import { downloadVideoFromUrl } from "@server/video/download";
import {
    createClipsFromVideo,
    createClipsFromVideoUsingRanges,
} from "@server/video/clip";
import { generateSubtitlesForClips } from "@server/video/caption";
import { renderShortsWithSubtitles } from "@server/video/render";
import {
    analyzeTranscriptForClips,
    ClipCandidate,
} from "@server/video/scoring";
import {
    analyzeFaceCropsForClips, EnergyFrame,
} from "@server/video/faceCrop";
import {extractAudioForWhisper} from "@server/video/audio";
import {analyzeAudioEnergyForClip} from "@server/video/audioEnergy";

export async function processJob(jobId: string) {
    const job = getJob(jobId);
    if (!job) {
        console.warn(`[processJob] Job not found: ${jobId}`);
        return;
    }

    try {
        updateJobStatus(jobId, "processing");
        updateJobStage(jobId, "downloading", 10);

        let videoInput = job.source;

        if (job.type === "url") {
            videoInput = await downloadVideoFromUrl(job.source);
        }

        // derive settings from job (with safe defaults)
        const desiredClipDuration = job.clipDurationSec ?? 30;
        const desiredMaxClips = job.maxClips ?? 3;
        const captionsEnabled = job.captionsEnabled ?? true;
        const aspect = job.aspect ?? "horizontal";
        const style = job.captionStyle ?? "karaoke";

        // --- AI CLIP ANALYSIS ---
        updateJobStage(jobId, "captioning", 25);

        let clips: string[] = [];
        let usedAICandidates = false;

        try {
            const candidates: ClipCandidate[] = await analyzeTranscriptForClips(
                videoInput,
                {
                    maxClips: desiredMaxClips,
                    minDurationSec: Math.max(10, desiredClipDuration - 5),
                    maxDurationSec: desiredClipDuration + 10,
                    targetDurationSec: desiredClipDuration,
                }
            );

            if (candidates.length > 0) {
                usedAICandidates = true;
                updateJobStage(jobId, "clipping", 35);

                const PAD = 2.0;

                const ranges = candidates.map((c) => ({
                    start: Math.max(0, c.start - PAD),
                    end: c.end + PAD,
                }));

                clips = await createClipsFromVideoUsingRanges(videoInput, ranges);

            } else {
                console.warn(
                    "[processJob] No AI candidates found, will fall back to legacy clipping."
                );
            }
        } catch (err) {
            console.error(
                "[processJob] Error during AI clip analysis. Falling back:",
                err
            );
        }

        // --- FALLBACK: legacy clipping ---
        if (!usedAICandidates || clips.length === 0) {
            updateJobStage(jobId, "clipping", 35);
            clips = await createClipsFromVideo(videoInput, {
                clipDurationSec: desiredClipDuration,
                maxClips: desiredMaxClips,
            });
        }

        setJobClips(jobId, clips);

        const energyByClip: (EnergyFrame[] | null)[] = [];

        for (const clipPath of clips) {
            try {
                const audioMp3Path = await extractAudioForWhisper(clipPath);
                const energyFrames = await analyzeAudioEnergyForClip(audioMp3Path);
                energyByClip.push(energyFrames);

                console.log("[processJob] energyFrames", energyFrames.slice(0, 5));
            } catch (e) {
                console.warn("[processJob] Failed to compute energy frames for clip:", clipPath, e);
                energyByClip.push(null);
            }
        }

        // --- SUBTITLES (AI) ---
        updateJobStage(jobId, "captioning", 50);
        const subtitleFiles = await generateSubtitlesForClips(clips, {captionStyle: job.captionStyle});
        // --- FACE-AWARE SMART CROP (NEW) ---
        updateJobStage(jobId, "clipping", 60);
        const smartCrops = await analyzeFaceCropsForClips(clips, energyByClip);

        // --- RENDER (WITH OR WITHOUT SUBTITLES) ---
        updateJobStage(jobId, "rendering", 70);

        let videos: string[] = [];
        let thumbs: string[] = [];

        ({ videos, thumbs } = await renderShortsWithSubtitles(
            clips,
            subtitleFiles,
            {
                aspect,
                style,
                captionsEnabled,
                smartCrop: smartCrops,
            }
        ));


        setJobCaptionedResults(jobId, videos, thumbs);

        updateJobStage(jobId, "finished", 100);
        updateJobStatus(jobId, "done");
    } catch (err) {
        console.error("[processJob] Error:", err);
        updateJobStatus(jobId, "failed");
        updateJobStage(jobId, "finished", 100);
    }
}
