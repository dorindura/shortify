// src/server/storage/upload.ts
import fs from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase/admin"; // adjust import if needed

const BUCKET = "shorts"; // your bucket name

function toFsPath(p: string) {
    // If you pass "/shorts/abc.mp4", treat it as public URL path
    if (p.startsWith("/")) {
        return path.join(process.cwd(), "public", p); // -> .../public/shorts/abc.mp4
    }

    // If you pass "shorts/abc.mp4", also treat as public-relative
    if (p.startsWith("shorts/")) {
        return path.join(process.cwd(), "public", p);
    }

    // Otherwise assume it's already a real filesystem path
    return p;
}

export async function uploadLocalFileToStorage(localPath: string, objectPath: string) {
    const supabase = supabaseAdmin();

    const fsPath = toFsPath(localPath);
    const bytes = await fs.readFile(fsPath);

    const ext = path.extname(objectPath).toLowerCase();
    const contentType =
        ext === ".mp4" ? "video/mp4" :
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
                ext === ".png" ? "image/png" :
                    "application/octet-stream";

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, bytes, {
            contentType,
            upsert: true,
        });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return data.publicUrl;
}
