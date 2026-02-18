import fsp from "fs/promises";
import path from "path";

const IS_PROD = process.env.NODE_ENV === "production";

const ROOT = process.cwd();

function normalizeToFsPath(p: string) {
  if (!p) return "";

  if (p.startsWith("/shorts/") || p.startsWith("/thumbs/")) {
    return path.join(ROOT, "public", p.replace(/^\/+/, ""));
  }

  return p;
}

function isInsideProject(p: string) {
  const abs = path.resolve(p);
  return abs.startsWith(ROOT + path.sep);
}

async function safeRm(targetPath: string) {
  if (!targetPath) return;

  const normalized = normalizeToFsPath(targetPath);
  const abs = path.resolve(normalized);

  if (!isInsideProject(abs)) {
    console.warn("[cleanup] Refusing to delete outside project:", abs);
    return;
  }

  try {
    await fsp.rm(abs, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export async function cleanupLocalJobArtifacts(opts: {
  downloadedVideoPath?: string;

  clipPaths?: string[];

  audioPaths?: string[];

  subtitlePaths?: string[];

  extraPaths?: string[];
}) {
  if (!IS_PROD) return;

  const {
    downloadedVideoPath,
    clipPaths = [],
    audioPaths = [],
    subtitlePaths = [],
    extraPaths = [],
  } = opts;

  await Promise.all([
    downloadedVideoPath ? safeRm(downloadedVideoPath) : Promise.resolve(),
    ...clipPaths.map(safeRm),
    ...audioPaths.map(safeRm),
    ...subtitlePaths.map(safeRm),
    ...extraPaths.map(safeRm),
  ]);

  console.log("[cleanup] Local artifacts deleted (prod).");
}
