// src/utils/validators.ts
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

export function isValidUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

export function hasVideoExtension(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
