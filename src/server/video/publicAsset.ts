import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const TMP_PUBLIC_ASSETS_DIR = path.join(process.cwd(), "tmp", "public-assets");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function guessExtensionFromUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();

  if (clean.endsWith(".mp4")) return ".mp4";
  if (clean.endsWith(".mov")) return ".mov";
  if (clean.endsWith(".webm")) return ".webm";
  if (clean.endsWith(".jpg")) return ".jpg";
  if (clean.endsWith(".jpeg")) return ".jpeg";
  if (clean.endsWith(".png")) return ".png";

  return ".bin";
}

export async function downloadPublicAssetToTemp(publicUrl: string): Promise<string> {
  if (!publicUrl || typeof publicUrl !== "string") {
    throw new Error("Missing public asset URL");
  }

  await ensureDir(TMP_PUBLIC_ASSETS_DIR);

  const ext = guessExtensionFromUrl(publicUrl);
  const outPath = path.join(TMP_PUBLIC_ASSETS_DIR, `${randomUUID()}${ext}`);

  const response = await fetch(publicUrl);

  if (!response.ok) {
    throw new Error(`Failed to download public asset: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.writeFile(outPath, buffer);
  return outPath;
}
