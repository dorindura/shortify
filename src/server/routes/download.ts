// import { FastifyInstance } from "fastify";
//
// export async function registerDownloadRoute(app: FastifyInstance) {
//     app.get("/api/download", async (req, reply) => {
//         const q = req.query as any;
//         const fileUrl = q?.url as string | undefined;
//         const filename = (q?.filename as string | undefined) || "short.mp4";
//
//         if (!fileUrl) return reply.code(400).send({ error: "Missing url" });
//
//         const upstream = await fetch(fileUrl);
//         if (!upstream.ok || !upstream.body) {
//             return reply.code(502).send({ error: "Failed to fetch file" });
//         }
//
//         reply.header("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
//         reply.header("Content-Disposition", `attachment; filename="${filename}"`);
//         reply.header("Cache-Control", "no-store");
//
//         return reply.send(upstream.body as any);
//     });
// }


import { FastifyInstance } from "fastify";
import { downloadVideoFromUrl } from "../video/download";
import fsSync from "fs";
import path from "path";

export async function registerDownloadRoute(app: FastifyInstance) {
    app.get("/api/download", async (req, reply) => {
        const q = req.query as any;
        const videoUrl = q?.url as string | undefined;

        if (!videoUrl) {
            return reply.code(400).send({ error: "Missing YouTube URL" });
        }

        try {
            // Pasul 1: Descarcă video-ul pe server
            const localFilePath = await downloadVideoFromUrl(videoUrl);
            const filename = path.basename(localFilePath);

            // Pasul 2: Verifică stream-ul de fișier
            const fileStream = fsSync.createReadStream(localFilePath);

            // Pasul 3: Trimite fișierul către browser
            reply.header("Content-Type", "video/mp4");
            reply.header("Content-Disposition", `attachment; filename="${q?.filename || filename}"`);

            return reply.send(fileStream);

        } catch (error: any) {
            console.error("[Route Error]:", error);
            return reply.code(500).send({
                error: "Processing failed",
                message: error.message
            });
        }
    });
}