// src/server/routes/youtube.ts
import { FastifyInstance } from "fastify";
import { requireUser } from "@server/auth/requireUser";
import { dbGetJob, dbUpdateJobQuoteMeta } from "@server/jobs/jobsDb";
import {
  deleteYoutubeChannel,
  getYoutubeChannel,
  saveYoutubeChannel,
} from "@server/youtube/channelsDb";
import {
  exchangeCodeForChannel,
  getAuthUrl,
  uploadVideoToYouTube,
  verifyOAuthState,
} from "@server/youtube/youtubeClient";
import type { QuoteReelMeta } from "@lib/jobsStore";

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    ""
  );
}

export async function registerYoutubeRoute(app: FastifyInstance) {
  // Is a channel connected for this user?
  app.get("/api/youtube/status", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const channel = await getYoutubeChannel(user.id);
    return reply.send({
      connected: !!channel,
      channelTitle: channel?.channel_title ?? null,
      channelId: channel?.channel_id ?? null,
    });
  });

  // Start the OAuth flow: returns the Google consent URL to redirect to.
  app.get("/api/youtube/auth-url", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    try {
      return reply.send({ url: getAuthUrl(user.id) });
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // Google redirects here after consent (no auth header — identity is in state).
  app.get("/api/youtube/callback", async (req, reply) => {
    const query = (req.query ?? {}) as Record<string, string>;
    const base = appBaseUrl();

    const fail = (message: string) => {
      if (base) return reply.redirect(`${base}/dashboard?youtube=error`);
      return reply.code(400).send({ error: message });
    };

    if (query.error) return fail(query.error);
    if (!query.code || !query.state) return fail("Missing code or state");

    const userId = verifyOAuthState(query.state);
    if (!userId) return fail("Invalid or expired state");

    try {
      const channel = await exchangeCodeForChannel(query.code);
      await saveYoutubeChannel({
        userId,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        refreshToken: channel.refreshToken,
      });

      if (base) return reply.redirect(`${base}/dashboard?youtube=connected`);
      return reply.send({ connected: true, channelTitle: channel.channelTitle });
    } catch (err) {
      console.error("[youtube/callback] error:", err);
      return fail((err as Error).message);
    }
  });

  app.post("/api/youtube/disconnect", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    await deleteYoutubeChannel(user.id);
    return reply.send({ ok: true });
  });

  // Publish a finished quote reel to the connected channel (private by default).
  app.post("/api/youtube/publish", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!jobId) return reply.code(400).send({ error: "Missing jobId" });

    const privacyStatus =
      body.privacyStatus === "unlisted" || body.privacyStatus === "public"
        ? (body.privacyStatus as "unlisted" | "public")
        : "private";

    const channel = await getYoutubeChannel(user.id);
    if (!channel) {
      return reply.code(400).send({ error: "No YouTube channel connected" });
    }

    const job = await dbGetJob(jobId);
    if (!job || job.owner_id !== user.id) {
      return reply.code(404).send({ error: "Job not found" });
    }
    if (job.job_goal !== "quote_reel") {
      return reply.code(400).send({ error: "Only quote reels can be published" });
    }

    const videoUrl: string | undefined = job.captioned_clips?.[0];
    if (!videoUrl) {
      return reply.code(400).send({ error: "Job has no finished video to publish" });
    }

    const meta = (job.quote_reel_meta ?? {}) as QuoteReelMeta;

    if (meta.youtube?.publishedVideoId) {
      return reply.code(409).send({
        error: "This reel was already published",
        videoUrl: meta.youtube.publishedUrl,
      });
    }

    const title =
      meta.youtube?.title?.trim() ||
      meta.finalScript?.split(/(?<=[.!?])\s+/)[0]?.trim() ||
      "Untitled reel";
    const description = meta.youtube?.description ?? "";
    const tags = meta.youtube?.tags;

    try {
      const result = await uploadVideoToYouTube({
        refreshToken: channel.refresh_token,
        videoUrl,
        title,
        description,
        tags,
        privacyStatus,
      });

      await dbUpdateJobQuoteMeta(jobId, {
        ...meta,
        youtube: {
          ...(meta.youtube ?? { title, description, tags: tags ?? [], hashtags: [] }),
          publishedVideoId: result.videoId,
          publishedUrl: result.videoUrl,
          publishedAt: new Date().toISOString(),
          privacyStatus,
        },
      });

      return reply.send({ ok: true, videoUrl: result.videoUrl, videoId: result.videoId });
    } catch (err) {
      console.error("[youtube/publish] error:", err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
