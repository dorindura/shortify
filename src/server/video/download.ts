import { execFile } from "child_process";
import fsSync, { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

type CmdResult = { stdout: string; stderr: string };

const MIN_DOWNLOAD_HEIGHT = 720;
const PREFERRED_MAX_DOWNLOAD_HEIGHT = 1080;

function runCommand(file: string, args: string[]): Promise<CmdResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        // yt-dlp poate scoate mult output pe stderr; evită "maxBuffer exceeded"
        maxBuffer: 1024 * 1024 * 50, // 50MB
        env: { ...process.env }, // păstrează PATH-ul shell-ului
      },
      (error, stdout, stderr) => {
        if (error) {
          const enhancedError = new Error(`${error.message}\nSTDERR: ${stderr}`);
          reject(enhancedError);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Erori care indică faptul că ai nevoie de autentificare / cookies:
 * - age gate
 * - sign in
 * - private / members-only / unavailable
 * - consent
 */
function shouldRetryWithCookies(errMsg: string) {
  const m = errMsg.toLowerCase();
  return (
    m.includes("sign in") ||
    m.includes("confirm your age") ||
    m.includes("age-restricted") ||
    m.includes("age restricted") ||
    m.includes("login") ||
    m.includes("private video") ||
    m.includes("this video is private") ||
    m.includes("members-only") ||
    m.includes("members only") ||
    m.includes("unavailable") ||
    m.includes("this video is not available") ||
    m.includes("consent") ||
    m.includes("watch this video") || // uneori apare în mesaje de access
    looksLikeMissingFormatsFromChallenge(m)
  );
}

function looksLikeMissingFormatsFromChallenge(errMsg: string) {
  return (
    errMsg.includes("requested format is not available") ||
    errMsg.includes("n challenge solving failed") ||
    errMsg.includes("sabr-only streaming experiment") ||
    errMsg.includes("some formats may be missing")
  );
}

/**
 * "Cookies poisoned" = cu cookies nu mai primești formate (exact cazul tău)
 */
function looksLikeCookiesPoisoned(errMsg: string) {
  return (
    errMsg.includes("Only images are available") ||
    errMsg.includes("Requested format is not available") ||
    errMsg.includes("n challenge solving failed")
  );
}

function shorten(s: string, n = 300) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function buildDownloadFailureMessage(lastErr: unknown) {
  const msg = getErrorMessage(lastErr);

  if (looksLikeMissingFormatsFromChallenge(msg.toLowerCase())) {
    return [
      "Download failed because yt-dlp could not see a 720p+ YouTube format.",
      "The local yt-dlp/EJS challenge solver is likely outdated; update yt-dlp and restart the worker.",
      `Last error: ${msg}`,
    ].join(" ");
  }

  return `Download failed; final mp4 not found. Last error: ${msg}`;
}

async function probeVideoHeight(filePath: string): Promise<number | null> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=height",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const height = Number.parseInt(stdout.trim(), 10);
  return Number.isFinite(height) && height > 0 ? height : null;
}

export async function downloadVideoFromUrl(url: string): Promise<string> {
  const baseDir = path.join(process.cwd(), "uploads", "remote");
  await fs.mkdir(baseDir, { recursive: true });

  const id = randomUUID();
  const finalPath = path.join(baseDir, `${id}.mp4`);

  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  const hasCookies = fsSync.existsSync(cookiesPath);

  // Flags stabile pt YouTube (din testul tău cu -F)
  const stableYouTubeArgs = [
    "--js-runtime",
    "node",
    "--remote-components",
    "ejs:github",
    "--extractor-args",
    "youtube:player_client=default,-android_sdkless",
  ];

  const format = [
    `bestvideo[vcodec^=avc1][height<=${PREFERRED_MAX_DOWNLOAD_HEIGHT}][height>=${MIN_DOWNLOAD_HEIGHT}]+bestaudio[ext=m4a]`,
    `bestvideo[ext=mp4][height<=${PREFERRED_MAX_DOWNLOAD_HEIGHT}][height>=${MIN_DOWNLOAD_HEIGHT}]+bestaudio[ext=m4a]`,
    `bestvideo[height<=${PREFERRED_MAX_DOWNLOAD_HEIGHT}][height>=${MIN_DOWNLOAD_HEIGHT}]+bestaudio`,
    `best[ext=mp4][height<=${PREFERRED_MAX_DOWNLOAD_HEIGHT}][height>=${MIN_DOWNLOAD_HEIGHT}]`,
    `best[height<=${PREFERRED_MAX_DOWNLOAD_HEIGHT}][height>=${MIN_DOWNLOAD_HEIGHT}]`,
    `bestvideo[height>=${MIN_DOWNLOAD_HEIGHT}]+bestaudio`,
    `best[height>=${MIN_DOWNLOAD_HEIGHT}]`,
  ].join("/");

  const baseArgs = [
    ...stableYouTubeArgs,
    url,
    "-f",
    format,
    "-o",
    finalPath,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-check-certificate",
  ];

  async function attempt(name: string, useCookies: boolean) {
    const args = [...baseArgs];

    if (useCookies && hasCookies) {
      args.push("--cookies", cookiesPath);
      console.log(`[downloadVideoFromUrl] 🍪 Attempt ${name}: using cookies.txt`);
    } else {
      console.log(`[downloadVideoFromUrl] Attempt ${name}: without cookies`);
    }

    console.log(`[downloadVideoFromUrl] Starting download (${name}) for: ${url}`);

    const { stdout, stderr } = await runCommand("yt-dlp", args);

    if (stdout) {
      console.log(`[downloadVideoFromUrl] (${name}) stdout:`, shorten(stdout, 250));
    }
    if (stderr) {
      console.log(`[downloadVideoFromUrl] (${name}) stderr:`, shorten(stderr, 250));
    }
  }

  let lastErr: unknown = null;

  // Attempt 1: fără cookies (default)
  try {
    await attempt("no-cookies-1", false);
  } catch (err: unknown) {
    lastErr = err;
    const msg = getErrorMessage(err);

    console.error("[downloadVideoFromUrl] no-cookies-1 failed:", msg);

    // Dacă pare că trebuie auth, încercăm cu cookies
    if (hasCookies && shouldRetryWithCookies(msg)) {
      // Attempt 2: cu cookies
      try {
        await attempt("with-cookies", true);
      } catch (err2: unknown) {
        lastErr = err2;
        const msg2 = getErrorMessage(err2);

        console.error("[downloadVideoFromUrl] with-cookies failed:", msg2);

        // Dacă cookies par "poisoned", revenim la fără cookies (Attempt 3)
        // (cazul tău: fără cookies merge, cu cookies moare)
        if (looksLikeCookiesPoisoned(msg2)) {
          console.warn(
            "[downloadVideoFromUrl] ⚠️ Cookies appear poisoned for this video. Retrying without cookies...",
          );
          try {
            await attempt("no-cookies-2", false);
          } catch (err3: unknown) {
            lastErr = err3;
          }
        }
      }
    }
  }

  // Validare fișier final
  try {
    await fs.access(finalPath);
    const stats = await fs.stat(finalPath);
    const height = await probeVideoHeight(finalPath);

    if (height == null) {
      throw new Error("Download finished, but could not verify video resolution.");
    }

    if (height < MIN_DOWNLOAD_HEIGHT) {
      throw new Error(
        `Downloaded video is only ${height}p; expected at least ${MIN_DOWNLOAD_HEIGHT}p.`,
      );
    }

    console.log(
      `[downloadVideoFromUrl] File created: ${finalPath} (${height}p, ${(stats.size / 1024 / 1024).toFixed(
        2,
      )} MB)`,
    );
    return finalPath;
  } catch {
    const files = await fs.readdir(baseDir).catch(() => []);
    console.error(`[downloadVideoFromUrl] Content of ${baseDir}:`, files);
    throw new Error(buildDownloadFailureMessage(lastErr));
  }
}
