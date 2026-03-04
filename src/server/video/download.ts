import { execFile } from "child_process";
import fsSync, { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

type CmdResult = { stdout: string; stderr: string };

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
    m.includes("watch this video") // uneori apare în mesaje de access
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

  // Format: încearcă DASH high quality, dar are fallback la 18 (progressive mp4)
  const format = `bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/18/best[ext=mp4]/best`;

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

  let lastErr: any = null;

  // Attempt 1: fără cookies (default)
  try {
    await attempt("no-cookies-1", false);
  } catch (err: any) {
    lastErr = err;
    const msg = String(err?.message ?? err);

    console.error("[downloadVideoFromUrl] no-cookies-1 failed:", msg);

    // Dacă pare că trebuie auth, încercăm cu cookies
    if (hasCookies && shouldRetryWithCookies(msg)) {
      // Attempt 2: cu cookies
      try {
        await attempt("with-cookies", true);
      } catch (err2: any) {
        lastErr = err2;
        const msg2 = String(err2?.message ?? err2);

        console.error("[downloadVideoFromUrl] with-cookies failed:", msg2);

        // Dacă cookies par "poisoned", revenim la fără cookies (Attempt 3)
        // (cazul tău: fără cookies merge, cu cookies moare)
        if (looksLikeCookiesPoisoned(msg2)) {
          console.warn(
            "[downloadVideoFromUrl] ⚠️ Cookies appear poisoned for this video. Retrying without cookies...",
          );
          try {
            await attempt("no-cookies-2", false);
          } catch (err3: any) {
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
    console.log(
      `[downloadVideoFromUrl] File created: ${finalPath} (${(stats.size / 1024 / 1024).toFixed(
        2,
      )} MB)`,
    );
    return finalPath;
  } catch {
    const files = await fs.readdir(baseDir).catch(() => []);
    console.error(`[downloadVideoFromUrl] Content of ${baseDir}:`, files);
    throw new Error(
      `Download failed; final mp4 not found. Last error: ${lastErr?.message ?? lastErr}`,
    );
  }
}
