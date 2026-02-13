import { execFile } from "child_process";
import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import { randomUUID } from "crypto";

function runCommand(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(file, args, (error, stdout, stderr) => {
            if (error) {
                const enhancedError = new Error(`${error.message}\nSTDERR: ${stderr}`);
                reject(enhancedError);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

export async function downloadVideoFromUrl(url: string): Promise<string> {
    const baseDir = path.join(process.cwd(), "uploads", "remote");
    await fs.mkdir(baseDir, { recursive: true });

    const id = randomUUID();
    const finalName = `${id}.mp4`;
    const finalPath = path.join(baseDir, finalName);

    const cookiesPath = path.join(process.cwd(), "cookies.txt");

    const args = [
        url,
        '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/best',
        '-o', finalPath,
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--add-header', 'Referer:https://www.google.com/',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];

    if (fsSync.existsSync(cookiesPath)) {
        console.log("[downloadVideoFromUrl] 🍪 Using cookies.txt for YouTube authentication");
        args.push("--cookies", cookiesPath);
    } else {
        console.warn("[downloadVideoFromUrl] ⚠️ WARNING: No cookies.txt found at " + cookiesPath);
    }

    try {
        console.log(`[downloadVideoFromUrl] Starting download for: ${url}`);
        const { stdout, stderr } = await runCommand("yt-dlp", args);

        if (stdout) console.log("[downloadVideoFromUrl] yt-dlp stdout:", stdout.substring(0, 200) + "...");
    } catch (err: any) {
        console.error("[downloadVideoFromUrl] Error running yt-dlp:", err.message);
        throw new Error(`yt-dlp failed: ${err.message}`);
    }

    try {
        await fs.access(finalPath);
        const stats = await fs.stat(finalPath);
        console.log(`[downloadVideoFromUrl] File created: ${finalPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch {
        const files = await fs.readdir(baseDir);
        console.error(`[downloadVideoFromUrl] Content of ${baseDir}:`, files);
        throw new Error("Download completed but final mp4 file not found on disk at " + finalPath);
    }

    return finalPath;
}