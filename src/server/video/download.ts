// src/server/video/download.ts
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

function runCommand(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(file, args, (error, stdout, stderr) => {
            if (error) {
                error.message += `\nSTDERR: ${stderr}`;
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

/**
 * Download a video from a given URL to a local file path using yt-dlp.
 * Returns the absolute file path of the downloaded video (video+audio, merged mp4).
 */
export async function downloadVideoFromUrl(url: string): Promise<string> {
    const baseDir = path.join(process.cwd(), "uploads", "remote");
    await fs.mkdir(baseDir, { recursive: true });

    const id = randomUUID();

    // We EXPECT the final file to be this:
    const finalName = `${id}.mp4`;
    const finalPath = path.join(baseDir, finalName);

    // yt-dlp will download best video (<=1080p) + best audio and merge to mp4
    const formatSelector = "bv*[height<=1080]+ba/b[ext=mp4][height<=1080]/best";

    const args = [
        url,
        "-f",
        formatSelector,
        "--merge-output-format",
        "mp4",
        "-o",
        finalPath,     // directly write final file here
        "--no-playlist",
    ];


    try {
        const { stdout, stderr } = await runCommand("yt-dlp", args);
        if (stderr) console.warn("[downloadVideoFromUrl] yt-dlp stderr:", stderr);
    } catch (err) {
        console.error("[downloadVideoFromUrl] Error running yt-dlp:", err);
        throw new Error("Failed to download video");
    }

    // Sanity check: make sure the final file exists
    try {
        await fs.access(finalPath);
    } catch {
        throw new Error("Download completed but final mp4 file not found");
    }

    console.log("[downloadVideoFromUrl] Downloaded file:", finalPath);

    return finalPath;
}
