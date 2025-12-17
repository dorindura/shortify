import { spawn } from "child_process";
import path from "path";

export type AudioEnergyFrame = {
    tStart: number;
    tEnd: number;
    energy: number; // 0..1
};

export async function analyzeAudioEnergyForClip(
    audioPath: string
): Promise<AudioEnergyFrame[]> {
    return new Promise((resolve) => {
        const scriptPath = path.join(process.cwd(), "src", "python", "audio_energy.py");

        console.log("[analyzeAudioEnergyForClip] Running python3", scriptPath, audioPath);

        const proc = spawn("python3", [scriptPath, audioPath], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        let out = "";
        let err = "";

        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.stderr.on("data", (d) => (err += d.toString()));

        proc.on("error", (e) => {
            console.error("[analyzeAudioEnergyForClip] spawn error:", e);
            resolve([]);
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                console.error("[analyzeAudioEnergyForClip] python exit code", code, "stderr:", err);
                return resolve([]);
            }

            try {
                const frames = JSON.parse(out.trim() || "[]") as AudioEnergyFrame[];
                resolve(frames);
            } catch (e) {
                console.error("[analyzeAudioEnergyForClip] JSON parse error:", e, "raw:", out);
                resolve([]);
            }
        });
    });
}
