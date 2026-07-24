// src/server/tools/mineLibrary.ts
//
// Premium HD b-roll library builder.
//   yt-dlp (1080p) -> shot_miner.py (split + mechanical filter) -> OpenAI vision
//   (clean? quality? category?) -> ffmpeg cut+normalize -> public/assets/videos_hd/<category>/
//
// Existing library is never touched. Run:
//   npx dotenv -e .env.local -- npx tsx src/server/tools/mineLibrary.ts <url> [<url> ...]
//   (or pass a file of URLs, one per line, via --file urls.txt)
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const PROJECT_ROOT = process.cwd();
const VIDEO_ROOT = path.join(PROJECT_ROOT, "public", "assets", "videos");
const OUT_ROOT = path.join(PROJECT_ROOT, "public", "assets", "videos_hd");
const SHOT_MINER = path.join(PROJECT_ROOT, "src", "python", "shot_miner.py");
const PY = existsSync(path.join(PROJECT_ROOT, ".venv", "bin", "python"))
  ? path.join(PROJECT_ROOT, ".venv", "bin", "python")
  : "python3";

const MIN_QUALITY = 3; // 1-5 vision rating floor
const REVIEW_DIR = "_review"; // clean+good clips the model couldn't confidently place

// Definitions for the labels a vision model tends to misread from the word alone.
const CATEGORY_GLOSS: Record<string, string> = {
  "characters/fake":
    "a clearly visible human PERSON acting two-faced/deceptive (e.g. a fake friend). NEVER for monsters, creatures, auras, hands, skeletons, or symbolic imagery",
  "characters/faceless": "a person whose face is hidden or turned away, but clearly a human presence",
  "characters/staring": "a person staring intensely or menacingly",
  "characters/looking_down": "a person with head lowered / looking down (shame, defeat)",
  "characters/stepping": "close-up of feet or legs walking/stepping",
  "characters/standing_still": "a person standing motionless",
  "characters/fight": "people physically fighting or confronting each other",
  "characters/working": "a person focused on work/study/craft",
  "emotions/addiction":
    "a PERSON shown in the grip of a compulsion. NOT for chains, objects, or symbols (those are symbolic/*)",
  "emotions/toxic": "a toxic or manipulative relationship dynamic",
  "emotions/betrayal": "the moment or feeling of being betrayed",
  "emotions/blocked": "feeling emotionally stuck, shut out, or blocked",
  "emotions/broken": "a person emotionally broken or devastated",
  "emotions/censored": "someone silenced, or expression/mouth covered or hidden",
  "hooks/red_flag": "a warning-sign moment (a relationship/situation red flag)",
  "hooks/transformation": "a visible moment of change or transformation",
  "hooks/shocking": "a shocking, jaw-dropping reveal",
  "energy/bond": "the felt connection/bond between people",
  "social_situations/loneliness_in_crowd": "feeling alone while surrounded by people",
  "social_situations/being_judged": "a person being judged, watched, or scrutinized",
  "actions/negation": "a gesture of refusal / saying no",
  "actions/revealing": "revealing or uncovering something",
  "symbolic/masks": "masks as a symbol of a hidden self",
};

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    p.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

// Existing subcategory paths (e.g. "characters/thinking") the model must pick from.
async function listValidCategories(): Promise<string[]> {
  const out = new Set<string>();
  async function walk(dir: string, rel: string) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      if (nextRel === "cartoons" || nextRel === "openers") continue;
      const hasMp4 = (await fs.readdir(path.join(dir, e.name)).catch(() => [])).some((f) =>
        f.endsWith(".mp4"),
      );
      if (hasMp4 && rel) out.add(nextRel);
      await walk(path.join(dir, e.name), nextRel);
    }
  }
  await walk(VIDEO_ROOT, "");
  return [...out].sort();
}

type ShotMinerResult = {
  shots: Array<{
    start: number;
    end: number;
    dur: number;
    motion: number;
    faces: number;
    frame: string;
    phashes: string[];
  }>;
  content_crop?: [number, number, number, number];
  shot_count?: number;
  error?: string;
};

// ---- Perceptual dedup: no clip may share footage with any other clip ----
const INDEX_PATH = path.join(OUT_ROOT, ".library_index.json");
const HAM_THRESH = 8; // <=8/64 bits apart -> effectively the same frame
const SHARED_MIN = 2; // this many matching frames -> the clips overlap

type ClipSig = { path: string; phashes: string[] };

// popcount of a 4-bit nibble (0..15)
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

// Hamming distance between two equal-length hex pHash strings, nibble by nibble.
// No BigInt, so it compiles under any TS target.
function hamming(a: string, b: string): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    d += NIBBLE_BITS[(parseInt(a[i], 16) || 0) ^ (parseInt(b[i], 16) || 0)];
  }
  return d;
}

function sharesFootage(phashes: string[], entry: ClipSig): boolean {
  let shared = 0;
  for (const h of phashes) {
    for (const e of entry.phashes) {
      if (hamming(h, e) <= HAM_THRESH) {
        shared += 1;
        break;
      }
    }
    if (shared >= SHARED_MIN) return true;
  }
  return false;
}

function findDuplicate(phashes: string[], index: ClipSig[]): ClipSig | null {
  if (!phashes.length) return null;
  for (const entry of index) {
    if (sharesFootage(phashes, entry)) return entry;
  }
  return null;
}

async function loadIndex(): Promise<ClipSig[]> {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.clips) ? parsed.clips : [];
  } catch {
    return [];
  }
}

async function saveIndex(index: ClipSig[]): Promise<void> {
  await fs.mkdir(OUT_ROOT, { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify({ clips: index }), "utf8");
}

async function phashExistingClip(mp4Path: string): Promise<string[]> {
  const { stdout } = await run(PY, [SHOT_MINER, "--input", mp4Path, "--phash-only"]);
  try {
    return JSON.parse(stdout).phashes ?? [];
  } catch {
    return [];
  }
}

// Fingerprint any clips already on disk that aren't in the index yet, so the
// "no repeated footage" rule also covers clips mined before dedup existed.
async function backfillIndex(index: ClipSig[]): Promise<number> {
  const known = new Set(index.map((c) => c.path));
  const found: string[] = [];
  async function walk(dir: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".mp4") && !known.has(full)) found.push(full);
    }
  }
  await walk(OUT_ROOT);
  let added = 0;
  for (const mp4 of found) {
    const phashes = await phashExistingClip(mp4);
    if (phashes.length) {
      index.push({ path: mp4, phashes });
      added += 1;
    }
  }
  return added;
}

async function downloadVideo(url: string, outPath: string): Promise<boolean> {
  const args = [
    "-f",
    "bestvideo[height<=1080][ext=mp4]+bestaudio/best[height<=1080][ext=mp4]/best[height<=1080]",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    outPath,
    url,
  ];
  const { code } = await run("yt-dlp", args);
  return code === 0 && existsSync(outPath);
}

async function mineShots(videoPath: string, framesDir: string): Promise<ShotMinerResult> {
  const { stdout } = await run(PY, [
    SHOT_MINER,
    "--input",
    videoPath,
    "--frames-dir",
    framesDir,
    "--min-len",
    "3.0", // no more 2-second scraps
    "--max-len",
    "9.0",
  ]);
  try {
    return JSON.parse(stdout);
  } catch {
    return { shots: [], error: "shot_miner parse failed" };
  }
}

type Verdict = { clean: boolean; quality: number; category: string; hasPerson: boolean; reason: string };

function buildCategoryListing(categories: string[]): string {
  return categories
    .map((c) => (CATEGORY_GLOSS[c] ? `- ${c} — ${CATEGORY_GLOSS[c]}` : `- ${c}`))
    .join("\n");
}

async function classifyFrame(framePath: string, categories: string[]): Promise<Verdict | null> {
  const b64 = (await fs.readFile(framePath)).toString("base64");
  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You curate premium b-roll for vertical quote reels. Judge a single animation frame.

Return strict JSON:
{"clean": boolean, "quality": 1-5, "hasPerson": boolean, "category": "<exact path from the list, or empty string>", "reason": "<short>"}

- "clean": true ONLY if there is NO watermark, logo, channel handle/username, burned-in subtitle, or any on-screen text. Any text at all -> false.
- "quality": 1-5 on how PREMIUM and modern it looks. Reward sharp detail, rich color/lighting, and modern/high-resolution production. Penalize soft, grainy, low-detail, or dated-looking older 2D animation even if the composition is nice. 5 = crisp, striking, contemporary; 1 = soft/dated/blurry.
- "hasPerson": is a character/person meaningfully present?

Choosing "category" — the categories describe REAL human moments, emotions, actions, and places. Rules:
1. Use the EXACT meaning below, not just the label word. (e.g. "characters/fake" = a two-faced person, NOT a monster.)
2. Decision order: a person with a clear facial emotion -> emotions/*; a person in a pose/doing something -> characters/* or actions/*; a place/atmosphere with no dominant person -> scenes_by_context/* or symbolic/*.
3. Monsters, creatures, animals, or fantasy beings: pick by what they are DOING (fight, staring) or the scene — never "characters/fake".
4. Symbolic / abstract imagery (chains, glowing auras, disembodied hands, skeletons, objects, effects) belongs in symbolic/* — or "" if none fits. Never emotions/* or characters/fake for these.
5. If NOTHING fits with real confidence, return "category": "" (empty). Do NOT force a wrong category.
Return the exact path string, nothing invented.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Allowed categories:\n${buildCategoryListing(categories)}` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ] satisfies OpenAI.Chat.Completions.ChatCompletionContentPart[],
      },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Verdict>;
    const category = typeof v.category === "string" && categories.includes(v.category) ? v.category : "";
    return {
      clean: v.clean === true,
      quality: Number(v.quality) || 0,
      hasPerson: v.hasPerson === true,
      category,
      reason: typeof v.reason === "string" ? v.reason : "",
    };
  } catch {
    return null;
  }
}

async function cutAndNormalize(
  videoPath: string,
  start: number,
  end: number,
  crop: [number, number, number, number] | undefined,
  outPath: string,
): Promise<boolean> {
  const vf: string[] = [];
  if (crop && (crop[0] || crop[1] || crop[2] || crop[3])) {
    vf.push(`crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`);
  }
  vf.push("fps=30", "format=yuv420p");
  const args = [
    "-y",
    "-ss",
    start.toFixed(3),
    "-i",
    videoPath,
    "-t",
    (end - start).toFixed(3),
    "-an",
    "-vf",
    vf.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-movflags",
    "+faststart",
    outPath,
  ];
  const { code } = await run("ffmpeg", args);
  return code === 0 && existsSync(outPath);
}

async function processUrl(url: string, categories: string[], index: ClipSig[]) {
  console.log(`\n=== ${url} ===`);
  const work = path.join(os.tmpdir(), `mine-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  const videoPath = path.join(work, "src.mp4");
  const framesDir = path.join(work, "frames");

  try {
    process.stdout.write("  downloading... ");
    if (!(await downloadVideo(url, videoPath))) {
      console.log("FAILED (download)");
      return { kept: 0, seen: 0 };
    }
    console.log("ok");

    process.stdout.write("  mining shots... ");
    const mined = await mineShots(videoPath, framesDir);
    console.log(`${mined.shots.length} candidate shots`);
    if (!mined.shots.length) return { kept: 0, seen: 0 };

    let kept = 0;
    let dupes = 0;
    for (const shot of mined.shots) {
      // Global dedup: reject any shot whose footage already exists in another clip.
      const dup = findDuplicate(shot.phashes, index);
      if (dup) {
        dupes += 1;
        console.log(
          `    [dup]  ${shot.start.toFixed(1)}-${shot.end.toFixed(1)}s  already in ${path.basename(dup.path)}`,
        );
        continue;
      }

      const v = await classifyFrame(shot.frame, categories);
      if (!v) continue;
      // Keep any clean, high-quality clip. If the model wasn't confident about a
      // category, park it in _review/ rather than dropping or mis-filing it.
      const keepIt = v.clean && v.quality >= MIN_QUALITY;
      const category = v.category || REVIEW_DIR;
      const tag = !keepIt ? "drop" : v.category ? "KEEP" : "REVIEW";
      console.log(
        `    [${tag}] ${shot.start.toFixed(1)}-${shot.end.toFixed(1)}s  q=${v.quality} clean=${v.clean} ${category}  (${v.reason})`,
      );
      if (!keepIt) continue;

      const destDir = path.join(OUT_ROOT, category);
      await fs.mkdir(destDir, { recursive: true });
      const base = category.replace(/\//g, "_");
      const outPath = path.join(destDir, `${base}_${randomUUID().slice(0, 8)}.mp4`);
      if (await cutAndNormalize(videoPath, shot.start, shot.end, mined.content_crop, outPath)) {
        kept += 1;
        // record its fingerprint so nothing later reuses this footage
        index.push({ path: outPath, phashes: shot.phashes });
      }
    }
    console.log(`  kept ${kept} / ${mined.shots.length}  (${dupes} skipped as duplicates)`);
    return { kept, seen: mined.shots.length };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let urls: string[] = [];
  const fileIdx = argv.indexOf("--file");
  if (fileIdx >= 0 && argv[fileIdx + 1]) {
    const content = await fs.readFile(argv[fileIdx + 1], "utf8");
    urls = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } else {
    urls = argv.filter((a) => a.startsWith("http"));
  }

  if (!urls.length) {
    console.error("Usage: tsx src/server/tools/mineLibrary.ts <url> [<url> ...]  |  --file urls.txt");
    process.exit(1);
  }

  const categories = await listValidCategories();
  await fs.mkdir(OUT_ROOT, { recursive: true });
  const index = await loadIndex();
  const backfilled = await backfillIndex(index);
  if (backfilled) await saveIndex(index);
  console.log(
    `Loaded ${categories.length} categories, ${index.length} clips in dedup index (${backfilled} backfilled). Output -> ${OUT_ROOT}`,
  );

  let totalKept = 0;
  let totalSeen = 0;
  for (const url of urls) {
    const { kept, seen } = await processUrl(url, categories, index);
    totalKept += kept;
    totalSeen += seen;
    await saveIndex(index); // persist after each source
  }
  console.log(`\nDONE. Kept ${totalKept} clips from ${totalSeen} candidate shots across ${urls.length} source(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
