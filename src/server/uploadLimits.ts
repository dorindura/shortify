export const UPLOAD_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export function formatBytes(bytes: number) {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) return `${Number(gib.toFixed(1))}GB`;

  const mib = bytes / 1024 / 1024;
  return `${Math.round(mib)}MB`;
}
