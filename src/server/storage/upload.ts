// src/server/storage/upload.ts
import fs from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "shorts";

export type UploadedAsset = {
  publicUrl: string;
  objectPath: string;
  sizeBytes: number;
  bucket: string;
};

function toFsPath(p: string) {
  const normalized = p.replace(/\\/g, "/");

  if (
    normalized.startsWith("/shorts/") ||
    normalized.startsWith("/thumbs/") ||
    normalized.startsWith("/assets/")
  ) {
    return path.join(process.cwd(), "public", normalized.slice(1));
  }

  if (
    normalized.startsWith("shorts/") ||
    normalized.startsWith("thumbs/") ||
    normalized.startsWith("assets/")
  ) {
    return path.join(process.cwd(), "public", normalized);
  }

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.join(process.cwd(), normalized);
}

export async function uploadLocalFileToStorage(
  localPath: string,
  objectPath: string,
): Promise<UploadedAsset> {
  const supabase = supabaseAdmin();

  const fsPath = toFsPath(localPath);
  const bytesBuf = await fs.readFile(fsPath);
  const sizeBytes = bytesBuf.byteLength;

  const ext = path.extname(objectPath).toLowerCase();
  const contentType = ext === ".mp4"
    ? "video/mp4"
    : ext === ".jpg" || ext === ".jpeg"
    ? "image/jpeg"
    : ext === ".png"
    ? "image/png"
    : "application/octet-stream";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytesBuf, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  return {
    publicUrl: data.publicUrl,
    objectPath,
    sizeBytes,
    bucket: BUCKET,
  };
}
