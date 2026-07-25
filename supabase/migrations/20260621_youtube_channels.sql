-- Connected YouTube channels for auto-publish (single channel per user MVP).
create table if not exists public.youtube_channels (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  channel_id    text not null,
  channel_title text not null,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Server access is via the service role (supabaseAdmin), which bypasses RLS.
-- Enable RLS and add no policies so the table is never exposed to anon/auth keys
-- (refresh tokens must never be readable from the client).
alter table public.youtube_channels enable row level security;
