import { FastifyInstance } from "fastify";

export async function registerDownloadRoute(app: FastifyInstance) {
    app.get("/api/download", async (req, reply) => {
        const q = req.query as any;
        const fileUrl = q?.url as string | undefined;
        const filename = (q?.filename as string | undefined) || "short.mp4";

        if (!fileUrl) return reply.code(400).send({ error: "Missing url" });

        const upstream = await fetch(fileUrl);
        if (!upstream.ok || !upstream.body) {
            return reply.code(502).send({ error: "Failed to fetch file" });
        }

        reply.header("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        reply.header("Cache-Control", "no-store");

        return reply.send(upstream.body as any);
    });
}
