# Shortify / Hookify

AI-assisted short-form video repurposing app. Users sign in with Supabase, submit a URL or upload a source video, then the backend creates shorts, summaries, quote reels, or multi-source edits using OpenAI, ElevenLabs, ffmpeg, Python media analysis, BullMQ, Redis, and Supabase Storage.

The product is branded as **Hookify** in the UI, while the repo/package/deployment names still use **shortify** in several places.

## What This App Does

- Creates short clips from uploaded videos or URLs.
- Supports automatic AI clip selection and manual custom time ranges.
- Generates caption drafts, smart crops, preview clips, and review-ready edits.
- Lets users edit captions, overlays, black-and-white ranges, and endings before final render.
- Generates quote reels from manual text or an AI prompt, with optional ElevenLabs voiceover.
- Builds multi-source edits by cutting ranges from up to 5 source URLs and assembling a reviewable draft.
- Enforces free/pro plan limits and manages subscriptions through Stripe.
- Stores rendered outputs and thumbnails in the Supabase Storage `shorts` bucket.

## Stack

- **Frontend:** Next.js 16 App Router, React 19, Tailwind CSS 4, Supabase browser auth.
- **Backend API:** Fastify server in `src/server/index.ts`.
- **Jobs:** BullMQ queue named `jobs`, Redis via `REDIS_URL`.
- **Media:** ffmpeg, yt-dlp, Sharp, Python helpers, OpenCV, MediaPipe, librosa.
- **AI:** OpenAI for transcription/scoring/caption work and quote-reel scripts; ElevenLabs for voiceover and optional speech-to-text.
- **Database/storage:** Supabase Postgres and Supabase Storage.
- **Billing:** Stripe checkout, billing portal, and webhooks.
- **Deploy:** Docker + Fly.io, with separate `api` and `worker` processes.

## Repository Map

```text
src/app/                         Next.js routes, pages, Stripe API routes
src/components/                  React UI, dashboard, job creation/review panels
src/lib/                         Shared job types, Supabase clients, frontend data helpers
src/server/index.ts              Fastify API entrypoint
src/server/routes/               Fastify API route registrations
src/server/jobs/                 BullMQ queue, worker runner, job processors
src/server/video/                ffmpeg render/cut/caption/crop/audio utilities
src/server/ai/                   OpenAI and ElevenLabs integrations
src/server/storage/              Supabase Storage upload and prod cleanup helpers
src/server/billing/              Free/pro access and job-limit enforcement
src/python/                      Audio energy and face crop analyzers
supabase/functions/              Supabase Edge Functions
public/assets/                   Bundled quote-reel visual assets
public/emoji/                    Overlay emoji assets
Dockerfile                       Production image for Fastify API and worker
fly.toml                         Fly.io app/process/service config
```

## Runtime Architecture

1. The Next.js frontend reads `NEXT_PUBLIC_API_BASE_URL` and calls the Fastify API with a Supabase bearer token.
2. Fastify validates the user with Supabase auth (`requireUser`) and creates a `jobs` row.
3. Fastify enqueues a BullMQ job whose payload is only `{ jobId }`.
4. The worker fetches the job from Supabase and dispatches by `job_goal`:
   - `shorts`: download/upload source, select clips, create caption drafts, analyze audio/face crops, render previews, wait for review.
   - `summary`: select/assemble highlights and render a final summary.
   - `quote_reel`: generate or normalize script, select bundled assets, create voiceover/captions, render final video.
   - `multi_source_edit`: download selected sources, cut ranges, normalize, concat, upload a draft, wait for review.
5. Review endpoints persist edited captions, overlays, endings, black-and-white ranges, and review flags.
6. Render endpoints create final files, upload them to Supabase Storage, update the `jobs` row, and clean local artifacts in production.

## Local Development

Install dependencies:

```bash
npm ci
```

Run the Next.js frontend:

```bash
npm run dev
```

Run the Fastify API:

```bash
npm run dev:server
```

Run the BullMQ worker:

```bash
npm run dev:worker
```

The worker script explicitly uses `.env.local` through `dotenv-cli`. Do not print or inspect real env files; only use a safe `.env.example` or ask for placeholder values when documenting configuration.

## Required Services And Tools

Local media jobs need these available on the machine:

- Redis for BullMQ.
- ffmpeg for clipping, audio extraction, subtitles, thumbnails, and final renders.
- yt-dlp for URL downloads.
- Python 3 with the packages used by `src/python/*` when running face/audio analysis paths.
- Supabase project with the expected tables and the `shorts` storage bucket.
- OpenAI API access.
- Stripe account and webhook endpoint for billing.
- ElevenLabs API access for quote-reel voiceover and optional STT paths.

## Configuration

This project depends on these environment variable names. Values must stay secret.

### Frontend/public

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`

### Server/private

- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `ALLOWED_ORIGINS`
- `PORT`
- `WORKER_CONCURRENCY`
- `FFMPEG_THREADS`

### ElevenLabs and quote reels

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_MODEL_ID`
- `ELEVENLABS_STT_MODEL_ID`
- `ELEVENLABS_OUTPUT_FORMAT`
- `ELEVENLABS_VOICE_DARK_MALE`
- `ELEVENLABS_VOICE_STORYTELLER`
- `ELEVENLABS_VOICE_SOFT_FEMALE`
- `ELEVENLABS_VOICE_MOTIVATIONAL_MALE`
- `ELEVENLABS_VOICE_NEUTRAL`
- `ELEVENLABS_VOICE_DEEP_MALE`
- `ELEVENLABS_VOICE_FEMALE`
- `ELEVENLABS_STABILITY`
- `ELEVENLABS_SIMILARITY`
- `ELEVENLABS_STYLE`
- `QUOTE_REEL_CAPTION_PRESET`
- `QUOTE_REEL_CAPTION_FONT`
- `QUOTE_REEL_CAPTION_OFFSET_SEC`
- `QUOTE_REEL_HIGHLIGHT_WORDS`
- `QUOTE_REEL_CAPTION_MAX_WORDS_PER_CHUNK`
- `QUOTE_REEL_CAPTION_CHUNK_BREAK_GAP_SEC`
- `QUOTE_REEL_CAPTION_MAX_CHUNK_DURATION_SEC`

## Supabase Data Expectations

No SQL migrations are currently committed in this repo. The code expects these tables/objects to exist:

- `jobs`: central job table, including owner/status/stage/progress/source, render outputs, review data, quote reel metadata, multi-source config, ending config, soft-delete fields, and timestamps.
- `profiles`: includes at least `id`, `role`, and `created_at`.
- `usage_daily`: tracks free-plan jobs by `user_id` and `day`.
- `stripe_customers`: maps app users to Stripe customer ids.
- `stripe_subscriptions`: stores Stripe subscription status, price, period end, and cancellation state.
- `job_assets`: deleted when a job is hard-deleted.
- Supabase Storage bucket `shorts`: stores rendered videos and thumbnails under `jobs/{jobId}/...`.

Keep schema changes synchronized with the TypeScript row mappings in `src/lib/jobsRepo.ts`, `src/server/jobs/jobsDb.ts`, billing helpers, and admin routes.

## Important API Routes

Fastify server:

- `GET /health`
- `GET /api/jobs`
- `DELETE /api/jobs/:id`
- `POST /api/url`
- `POST /api/upload`
- `POST /api/quote-reel`
- `POST /api/multi-source-edit`
- `POST /api/jobs/:jobId/review`
- `POST /api/jobs/:jobId/render`
- `POST /api/multi-source-edit/:jobId/review`
- `POST /api/multi-source-edit/:jobId/render`
- `GET /api/admin/overview`
- `GET /api/admin/jobs`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/role`

Next.js API routes:

- `POST /api/stripe/checkout`
- `POST /api/stripe/portal`
- `POST /api/stripe/webhook`
- `GET /api/download`

## Build And Deploy

Build frontend:

```bash
npm run build
```

Build the server TypeScript output:

```bash
npm run build:server
```

Start compiled server:

```bash
npm run start:server
```

Production deploy is configured for Fly.io:

- App: `shortify-server`
- Region: `ams`
- Processes:
  - `api`: `node -r tsconfig-paths/register dist-server/server/index.js`
  - `worker`: `node -r tsconfig-paths/register dist-server/server/jobs/workerRunner.js`
- API listens on internal port `8080`.
- `REDIS_URL` and other secrets should be Fly secrets, not committed files.

The Docker image installs ffmpeg, Python, Deno, yt-dlp, and Python media packages. It also copies `public/`, `src/python/`, `dist-server/`, runtime tsconfig, package files, and `cookies.txt`.

## Generated And Sensitive Files

Do not commit generated runtime artifacts:

- `.next/`
- `dist-server/`
- `uploads/`
- `tmp/`
- `public/shorts/`
- `public/thumbs/`
- `*.tsbuildinfo`

Treat these as sensitive and do not read or print them:

- `.env`, `.env.local`, `.env.*`
- `cookies.txt`
- API keys, database URLs, service-role keys, bearer tokens, Stripe secrets, or webhook secrets in any form.

## Quality Checks

```bash
npm run lint
npm run build
npm run build:server
```

There is no dedicated test suite configured yet. For media pipeline work, verify the affected flow manually with the API, worker, and a real or placeholder media job in a safe development environment.
