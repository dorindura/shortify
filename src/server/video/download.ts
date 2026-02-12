// // src/server/video/download.ts
// import { execFile } from "child_process";
// import { promises as fs } from "fs";
// import path from "path";
// import { randomUUID } from "crypto";
//
// function runCommand(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
//     return new Promise((resolve, reject) => {
//         execFile(file, args, (error, stdout, stderr) => {
//             if (error) {
//                 error.message += `\nSTDERR: ${stderr}`;
//                 reject(error);
//                 return;
//             }
//             resolve({ stdout, stderr });
//         });
//     });
// }
//
// /**
//  * Download a video from a given URL to a local file path using yt-dlp.
//  * Returns the absolute file path of the downloaded video (video+audio, merged mp4).
//  */
// export async function downloadVideoFromUrl(url: string): Promise<string> {
//     const baseDir = path.join(process.cwd(), "uploads", "remote");
//     await fs.mkdir(baseDir, { recursive: true });
//
//     const id = randomUUID();
//
//     // We EXPECT the final file to be this:
//     const finalName = `${id}.mp4`;
//     const finalPath = path.join(baseDir, finalName);
//
//     // yt-dlp will download best video (<=1080p) + best audio and merge to mp4
//     const formatSelector = "bv*[height<=1080]+ba/b[ext=mp4][height<=1080]/best";
//
//     const args = [
//         url,
//         "-f",
//         formatSelector,
//         "--merge-output-format",
//         "mp4",
//         "-o",
//         finalPath,     // directly write final file here
//         "--no-playlist",
//     ];
//
//
//     try {
//         const { stdout, stderr } = await runCommand("yt-dlp", args);
//         if (stderr) console.warn("[downloadVideoFromUrl] yt-dlp stderr:", stderr);
//     } catch (err) {
//         console.error("[downloadVideoFromUrl] Error running yt-dlp:", err);
//         throw new Error("Failed to download video");
//     }
//
//     // Sanity check: make sure the final file exists
//     try {
//         await fs.access(finalPath);
//     } catch {
//         throw new Error("Download completed but final mp4 file not found");
//     }
//
//     console.log("[downloadVideoFromUrl] Downloaded file:", finalPath);
//
//     return finalPath;
// }


import { execFile } from "child_process";
import { promises as fs } from "fs";
import fsSync from "fs";
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
 */
export async function downloadVideoFromUrl(url: string): Promise<string> {
    const baseDir = path.join(process.cwd(), "uploads", "remote");
    await fs.mkdir(baseDir, { recursive: true });

    const id = randomUUID();
    const finalName = `${id}.mp4`;
    const finalPath = path.join(baseDir, finalName);

    // Calea către fișierul cookies.txt (trebuie să fie în rădăcina proiectului)
    const cookiesPath = path.join(process.cwd(), "cookies.txt");

    // Selector de format robust
    const formatSelector = "bv*[height<=1080]+ba/b[ext=mp4][height<=1080]/best";

    const args = [
        url,
        "-f", formatSelector,
        "--merge-output-format", "mp4",
        "-o", finalPath,
        "--no-playlist",
        // Identitate de browser real pentru a evita blocarea IP-ului de datacenter
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "--no-check-certificate",
        "--add-header", "Accept-Language:en-US,en;q=0.9",
        "--add-header", "Sec-Fetch-Mode:navigate",
    ];

    // Adăugăm cookies dacă fișierul există
    if (fsSync.existsSync(cookiesPath)) {
        console.log("[downloadVideoFromUrl] 🍪 Using cookies.txt for YouTube authentication");
        args.push("--cookies", cookiesPath);
    } else {
        console.warn("[downloadVideoFromUrl] ⚠️ WARNING: No cookies.txt found at " + cookiesPath + ". Fly.io IP might be blocked.");
    }

    try {
        console.log(`[downloadVideoFromUrl] Starting download for: ${url}`);
        const { stdout, stderr } = await runCommand("yt-dlp", args);
        if (stderr) console.warn("[downloadVideoFromUrl] yt-dlp stderr:", stderr);
    } catch (err) {
        console.error("[downloadVideoFromUrl] Error running yt-dlp:", err);
        throw new Error("Failed to download video - YouTube might be blocking the server IP");
    }

    // Verificăm dacă fișierul a fost creat
    try {
        await fs.access(finalPath);
    } catch {
        throw new Error("Download completed but final mp4 file not found on disk");
    }

    console.log("[downloadVideoFromUrl] Download successful:", finalPath);
    return finalPath;
}