import fs from "fs/promises";
import path from "path";

const IMAGE_ROOT = path.join(process.cwd(), "public", "assets", "images");

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function listImagesFromFolders(folders: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const folder of folders) {
    const absFolder = path.join(IMAGE_ROOT, folder);

    let entries: string[] = [];
    try {
      entries = await fs.readdir(absFolder);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;

      results.push(path.join(absFolder, entry));
    }
  }

  return results;
}

export function pickRandomImages(input: { images: string[]; targetCount: number }): string[] {
  const { images, targetCount } = input;

  if (!images.length) {
    throw new Error("No images found for Quote Reel.");
  }

  const shuffled = shuffle(images);
  const picked: string[] = [];

  let pool = [...shuffled];

  while (picked.length < targetCount) {
    if (pool.length === 0) {
      pool = shuffle(images);
    }

    const candidate = pool.shift()!;
    const prev = picked[picked.length - 1];

    if (prev && prev === candidate) continue;

    picked.push(candidate);
  }

  return picked;
}
