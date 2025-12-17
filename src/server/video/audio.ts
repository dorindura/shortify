// src/server/video/audio.ts
import path from "path";
import fsPromises from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`[${logPrefix}] Running ${cmd} ${args.join(" ")}`);
        const proc = spawn(cmd, args);

        proc.stderr.on("data", (data) => console.log(`[${logPrefix}] ${data}`));
        proc.on("error", reject);

        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} exited with code ${code}`));
        });
    });
}

// This is your old extractCompressedAudio, just renamed to match your mental model
export async function extractAudioForWhisper(videoPath: string): Promise<string> {
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
    console.log("[extractAudioForWhisper] Created:", outPath);

    return outPath;
}
