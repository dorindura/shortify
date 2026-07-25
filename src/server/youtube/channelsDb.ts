// src/server/youtube/channelsDb.ts
import { supabaseAdmin } from "@/lib/supabase/admin";

export type YoutubeChannelRow = {
  user_id: string;
  channel_id: string;
  channel_title: string;
  refresh_token: string;
  created_at?: string;
  updated_at?: string;
};

// One connected channel per user (single-channel MVP). Upsert on user_id.
export async function saveYoutubeChannel(channel: {
  userId: string;
  channelId: string;
  channelTitle: string;
  refreshToken: string;
}): Promise<void> {
  const supabase = supabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase.from("youtube_channels").upsert(
    {
      user_id: channel.userId,
      channel_id: channel.channelId,
      channel_title: channel.channelTitle,
      refresh_token: channel.refreshToken,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function getYoutubeChannel(userId: string): Promise<YoutubeChannelRow | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("youtube_channels")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as YoutubeChannelRow;
}

export async function deleteYoutubeChannel(userId: string): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("youtube_channels").delete().eq("user_id", userId);
  if (error) throw error;
}
