// src/server/jobs/worker.ts
import {
    dbGetJob,
    dbUpdateJobStatus,
    dbSetJobClips,
    dbSetJobCaptionedResults,
    dbUpdateJobStage,
} from "@/server/jobs/jobsDb";
import path from "path";
import { uploadLocalFileToStorage } from "@/server/storage/upload";

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
import { cleanupLocalJobArtifacts } from "@/server/storage/cleanup";

type SubtitleFile = string | { path: string };

function subtitleToPath(s: SubtitleFile): string {
    return typeof s === "string" ? s : s.path;
}

export async function processJob(jobId: string) {
    const job = await dbGetJob(jobId);
    if (!job) {
        console.warn(`[processJob] Job not found: ${jobId}`);
        return;
    }

    let downloadedVideoPath: string | null = null;
    const audioPaths: string[] = [];

    try {
        await dbUpdateJobStatus(jobId, "processing");
        await dbUpdateJobStage(jobId, "downloading", 10);

        let videoInput = job.source;

        if (job.type === "url") {
            downloadedVideoPath = await downloadVideoFromUrl(job.source);
            videoInput = downloadedVideoPath;
        }

        // derive settings from job (with safe defaults)
        const desiredClipDuration = job.clip_duration_sec ?? 30;
        const desiredMaxClips = job.max_clips ?? 3;
        const captionsEnabled = job.captions_enabled ?? true;
        const aspect = job.aspect ?? "horizontal";
        const style = job.caption_style ?? "karaoke";

        // --- AI CLIP ANALYSIS ---
        await dbUpdateJobStage(jobId, "captioning", 25);

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
                await dbUpdateJobStage(jobId, "clipping", 35);

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
            await dbUpdateJobStage(jobId, "clipping", 35);
            clips = await createClipsFromVideo(videoInput, {
                clipDurationSec: desiredClipDuration,
                maxClips: desiredMaxClips,
            });
        }

        await dbSetJobClips(jobId, clips);

        const energyByClip: (EnergyFrame[] | null)[] = [];

        for (const clipPath of clips) {
            try {
                const audioMp3Path = await extractAudioForWhisper(clipPath);
                audioPaths.push(audioMp3Path);
                const energyFrames = await analyzeAudioEnergyForClip(audioMp3Path);
                energyByClip.push(energyFrames);

                console.log("[processJob] energyFrames", energyFrames.slice(0, 5));
            } catch (e) {
                console.warn("[processJob] Failed to compute energy frames for clip:", clipPath, e);
                energyByClip.push(null);
            }
        }

        // --- SUBTITLES (AI) ---
        await dbUpdateJobStage(jobId, "captioning", 50);
        const subtitleFiles = await generateSubtitlesForClips(clips, {captionStyle: job.caption_style});

        const subtitlePaths: string[] = Array.isArray(subtitleFiles)
            ? (subtitleFiles as SubtitleFile[]).map(subtitleToPath).filter(Boolean)
            : [];
        // --- FACE-AWARE SMART CROP (NEW) ---
        await dbUpdateJobStage(jobId, "clipping", 60);
        const smartCrops = await analyzeFaceCropsForClips(clips, energyByClip);

        // --- RENDER (WITH OR WITHOUT SUBTITLES) ---
        await dbUpdateJobStage(jobId, "rendering", 70);

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

        // ✅ Upload rendered videos/thumbs to Storage, store URLs in DB, cleanup local files
        const videoUrls: string[] = [];
        const thumbUrls: string[] = [];

        for (let i = 0; i < videos.length; i++) {
            const localVideoPath = videos[i];
            const localThumbPath = thumbs?.[i];

            const videoObjectPath = `jobs/${jobId}/short-${i + 1}.mp4`;
            const thumbExt = localThumbPath ? path.extname(localThumbPath) || ".jpg" : ".jpg";
            const thumbObjectPath = `jobs/${jobId}/thumb-${i + 1}${thumbExt}`;

            const publicVideoUrl = await uploadLocalFileToStorage(localVideoPath, videoObjectPath);
            videoUrls.push(publicVideoUrl);

            if (localThumbPath) {
                const publicThumbUrl = await uploadLocalFileToStorage(localThumbPath, thumbObjectPath);
                thumbUrls.push(publicThumbUrl);
            } else {
                thumbUrls.push("");
            }
        }

        await dbSetJobCaptionedResults(jobId, videoUrls, thumbUrls);

        await cleanupLocalJobArtifacts({
            downloadedVideoPath: downloadedVideoPath ?? undefined,
            clipPaths: clips,
            audioPaths,
            subtitlePaths,
            extraPaths: [
                ...videos,
                ...(thumbs ?? []).filter(Boolean),
            ],
        });



        await dbUpdateJobStage(jobId, "finished", 100);
        await dbUpdateJobStatus(jobId, "done");
    } catch (err) {
        console.error("[processJob] Error:", err);
        await dbUpdateJobStatus(jobId, "failed");
        await dbUpdateJobStage(jobId, "finished", 100);
    }
}
