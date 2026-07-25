// src/server/youtube/youtubeClient.ts
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import os from "os";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for YouTube integration`);
  return value;
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("YOUTUBE_OAUTH_REDIRECT_URI"),
  );
}

// Sign the OAuth `state` so we can trust the user id Google echoes back to the
// callback (which arrives without our auth header). Keyed on the client secret.
function stateSecret(): string {
  return requireEnv("GOOGLE_CLIENT_SECRET");
}

export function signOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyOAuthState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  const [userId, tsRaw] = payload.split(".");
  const ts = Number(tsRaw);
  // State is valid for 15 minutes.
  if (!userId || !Number.isFinite(ts) || Date.now() - ts > 15 * 60 * 1000) return null;

  return userId;
}

export function getAuthUrl(userId: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: SCOPES,
    state: signOAuthState(userId),
    include_granted_scopes: true,
  });
}

export type ConnectedChannel = {
  channelId: string;
  channelTitle: string;
  refreshToken: string;
};

export async function exchangeCodeForChannel(code: string): Promise<ConnectedChannel> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke app access and reconnect with consent.",
    );
  }

  client.setCredentials(tokens);

  const youtube = google.youtube({ version: "v3", auth: client });
  const res = await youtube.channels.list({ part: ["snippet"], mine: true });

  const channel = res.data.items?.[0];
  if (!channel?.id) throw new Error("Could not read the connected YouTube channel");

  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? "YouTube channel",
    refreshToken: tokens.refresh_token,
  };
}

async function downloadToTempFile(url: string): Promise<string> {
  // Local-storage fallback (dev): "local:/abs/path".
  if (url.startsWith("local:")) return url.slice("local:".length);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download video for upload (${res.status})`);
  }

  const tmpPath = path.join(os.tmpdir(), `yt-upload-${randomUUID()}.mp4`);
  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(nodeStream, createWriteStream(tmpPath));
  return tmpPath;
}

export type UploadVideoInput = {
  refreshToken: string;
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "private" | "unlisted" | "public";
};

export type UploadVideoResult = {
  videoId: string;
  videoUrl: string;
};

export async function uploadVideoToYouTube(input: UploadVideoInput): Promise<UploadVideoResult> {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: input.refreshToken });

  const youtube = google.youtube({ version: "v3", auth: client });

  const localPath = await downloadToTempFile(input.videoUrl);
  const isTemp = !input.videoUrl.startsWith("local:");

  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description ?? "",
          tags: input.tags?.slice(0, 30),
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: input.privacyStatus ?? "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body: createReadStream(localPath) },
    });

    const videoId = res.data.id;
    if (!videoId) throw new Error("YouTube did not return a video id");

    return { videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } finally {
    if (isTemp) await fs.unlink(localPath).catch(() => {});
  }
}
