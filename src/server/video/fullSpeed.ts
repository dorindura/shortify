import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const LOCAL_OUTPUT_DIR = path.join(process.cwd(), "tmp", "local-outputs");

type RenderFullSpeedOptions = {
  jobId: string;
  speed?: number;
};

function runCmd(cmd: string, args: string[], logPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[${logPrefix}] Running ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || stderr);
        return;
      }

      reject(new Error(`${cmd} exited with code ${code}\n${stderr}`));
    });
  });
}

async function hasAudioStream(inputPath: string) {
  const output = await runCmd(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      inputPath,
    ],
    "probeAudioStream",
  );

  return output.trim().length > 0;
}

export async function renderFullVideoAtSpeed(
  inputPath: string,
  opts: RenderFullSpeedOptions,
): Promise<string> {
  const speed = Number.isFinite(opts.speed) && opts.speed ? opts.speed : 1;
  const safeSpeed = Math.max(0.25, Math.min(4, speed));
  const videoPts = (1 / safeSpeed).toFixed(6);

  await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });

  const outputPath = path.join(
    LOCAL_OUTPUT_DIR,
    `${opts.jobId || randomUUID()}-full-x${safeSpeed}.mp4`,
  );
  const includeAudio = await hasAudioStream(inputPath);

  const filterComplex = includeAudio
    ? `[0:v:0]setpts=${videoPts}*PTS,fps=30,format=yuv420p[v];[0:a:0]atempo=${safeSpeed.toFixed(
        6,
      )},aresample=48000[a]`
    : `[0:v:0]setpts=${videoPts}*PTS,fps=30,format=yuv420p[v]`;

  const args = ["-y", "-i", inputPath, "-filter_complex", filterComplex, "-map", "[v]"];

  if (includeAudio) {
    args.push("-map", "[a]");
  }

  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p");

  if (includeAudio) {
    args.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
  }

  args.push("-movflags", "+faststart", outputPath);

  await runCmd("ffmpeg", args, "renderFullVideoAtSpeed");

  return outputPath;
}
