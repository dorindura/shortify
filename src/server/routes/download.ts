import type { FastifyInstance } from "fastify";
import fsSync from "fs";
import path from "path";
import { Readable } from "stream";
import { downloadVideoFromUrl } from "../video/download";

type DownloadQuery = {
  url?: string;
  filename?: string;
};

function isYouTubeUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

function safeDownloadFilename(value: string | undefined, fallback: string) {
  const raw = value?.trim() || fallback;
  const basename = path.basename(raw).replace(/["\r\n]/g, "");
  return basename || fallback;
}

export async function registerDownloadRoute(app: FastifyInstance) {
  app.get("/api/download", async (req, reply) => {
    const q = req.query as DownloadQuery;
    const fileUrl = q.url;

    if (!fileUrl) {
      return reply.code(400).send({ error: "Missing url" });
    }

    try {
      if (isYouTubeUrl(fileUrl)) {
        const localFilePath = await downloadVideoFromUrl(fileUrl);
        const filename = safeDownloadFilename(q.filename, path.basename(localFilePath));
        const fileStream = fsSync.createReadStream(localFilePath);

        reply.header("Content-Type", "video/mp4");
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        reply.header("Cache-Control", "no-store");

        return reply.send(fileStream);
      }

      const upstream = await fetch(fileUrl);

      if (!upstream.ok || !upstream.body) {
        return reply.code(502).send({ error: "Failed to fetch file" });
      }

      const filename = safeDownloadFilename(q.filename, "short.mp4");

      reply.header(
        "Content-Type",
        upstream.headers.get("content-type") ?? "application/octet-stream",
      );
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.header("Cache-Control", "no-store");

      const webStream = upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0];
      return reply.send(Readable.fromWeb(webStream));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Route Error]:", error);
      return reply.code(500).send({
        error: "Processing failed",
        message,
      });
    }
  });
}
