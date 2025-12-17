// src/utils/formats.ts
export function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString();
}
