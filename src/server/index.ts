// src/server/index.ts
import dotenv from "dotenv";
import path from "path";

// Load env BEFORE loading any other modules
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  // sanity check (remove after)
  // console.log("OPENAI key present?", Boolean(process.env.OPENAI_API_KEY));

  const Fastify = (await import("fastify")).default;
  const cors = (await import("@fastify/cors")).default;
  const multipart = (await import("@fastify/multipart")).default;

  const { registerUrlRoute } = await import("./routes/url");
  const { registerUploadRoute } = await import("./routes/upload");
  const { registerJobsRoute } = await import("./routes/jobs");
  const { registerDownloadRoute } = await import("./routes/download");
  const { registerAdminRoutes } = await import("./routes/admin");

  const app = Fastify({
    logger: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB
  });

  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin.includes("localhost")) return cb(null, true);
      if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  });

  app.get("/health", async () => ({ ok: true }));

  await registerUrlRoute(app);
  await registerUploadRoute(app);
  await registerJobsRoute(app);
  await registerDownloadRoute(app);
  await registerAdminRoutes(app);

  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
