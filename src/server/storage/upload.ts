// src/server/storage/upload.ts
import fs from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "shorts";

function toFsPath(p: string) {
    if (p.startsWith("/")) return path.join(process.cwd(), "public", p);
    if (p.startsWith("shorts/")) return path.join(process.cwd(), "public", p);
    return p;
}

export async function uploadLocalFileToStorage(localPath: string, objectPath: string) {
    const supabase = supabaseAdmin();

    const fsPath = toFsPath(localPath);
    const bytesBuf = await fs.readFile(fsPath);
    const sizeBytes = bytesBuf.byteLength;

    const ext = path.extname(objectPath).toLowerCase();
    const contentType =
        ext === ".mp4" ? "video/mp4" :
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
                ext === ".png" ? "image/png" :
                    "application/octet-stream";

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
